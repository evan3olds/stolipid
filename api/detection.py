import numpy as np
from scipy import ndimage as ndi
from skimage.exposure import equalize_adapthist
from skimage.feature import peak_local_max
from skimage.filters import threshold_otsu
from skimage.measure import regionprops
from skimage.restoration import rolling_ball
from skimage.segmentation import watershed

# Prototype defaults, not yet calibrated against real microscopy images.
MIN_DROPLET_AREA_PX = 4
MIN_PEAK_DISTANCE_PX = 3
BACKGROUND_BALL_RADIUS_PX = 12
# Multiplier on Otsu's threshold. >1 raises the cutoff so only the brighter
# cores of clumped/touching droplets pass, shrinking the foreground mask
# and pulling touching droplets apart before fill-holes/watershed even run.
THRESHOLD_FACTOR = 1.5
# CLAHE clip limit for the stored hand-count image (render_hand_count_image
# only — detect_droplets doesn't use this). Previously tuned 0.01 -> 0.005
# because skimage's 0.01 default visibly widened each droplet's footprint
# (a smeared/blurred look); 0.003 trims that smearing further while still
# lifting droplets out of low local contrast.
CLAHE_CLIP_LIMIT = 0.003


def subtract_background(plane: np.ndarray) -> np.ndarray:
    """Rolling-ball background subtraction (radius 12px), returned as
    uint16. Flattens uneven illumination — shared first step of both
    render_hand_count_image's grayscale render and detect_droplets's
    threshold/watershed pipeline (see threshold_binary)."""
    if plane.size == 0 or plane.max() <= plane.min():
        return plane.astype(np.uint16)  # empty/flat crop — let threshold_binary's guard handle it

    background = rolling_ball(plane, radius=BACKGROUND_BALL_RADIUS_PX)
    return np.clip(plane.astype(np.float64) - background, 0, 65535).astype(np.uint16)


def threshold_binary(flattened: np.ndarray) -> np.ndarray:
    """Otsu threshold against a dark background (foreground = bright
    droplets), scaled by THRESHOLD_FACTOR and returned as a boolean mask.
    Step 2 of detect_droplets's pipeline — equivalent to ImageJ's
    Image > Adjust > Threshold with "Dark background", applied."""
    if flattened.size == 0 or flattened.max() <= flattened.min():
        return np.zeros_like(flattened, dtype=bool)

    try:
        thresh = threshold_otsu(flattened) * THRESHOLD_FACTOR
    except ValueError:
        return np.zeros_like(flattened, dtype=bool)  # flat/constant crop, no meaningful threshold
    return flattened > thresh


def _fill_and_watershed(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Shared mechanics for steps 3+ (fill holes -> distance-transform
    watershed), used by detect_droplets.

    Filling holes closes out-of-focus droplet centers that threshold_binary
    would otherwise leave as gaps in the mask. A Euclidean distance
    transform of the filled mask seeds one watershed marker per droplet
    center (its local maxima), and flooding the inverted distance map halts
    at droplet edges — ImageJ's Process > Binary > Watershed — so touching
    droplets separate into distinct regions.

    Returns (labels, coords): labels is an int array (0 background, 1..N one
    label per droplet region); coords is the (row, col) pixel position of
    each seed, ordered so coords[i] is the local maximum that seeded label
    i + 1 — detect_droplets uses that pairing to report one point per
    counted droplet."""
    if not mask.any():
        return np.zeros(mask.shape, dtype=int), np.empty((0, 2), dtype=int)

    filled = ndi.binary_fill_holes(mask)

    distance = ndi.distance_transform_edt(filled)
    coords = peak_local_max(distance, min_distance=MIN_PEAK_DISTANCE_PX, labels=filled)
    if coords.size == 0:
        return np.zeros(mask.shape, dtype=int), coords

    markers = np.zeros(distance.shape, dtype=int)
    markers[tuple(coords.T)] = np.arange(1, len(coords) + 1)

    labels = watershed(-distance, markers, mask=filled)
    return labels, coords


def render_hand_count_image(plane: np.ndarray) -> np.ndarray:
    """Rolling-ball background subtraction + CLAHE contrast enhancement,
    returned as a real grayscale uint16 image (not a binary threshold mask)
    for the stored hand-count image (cells.image_url). Flattens uneven
    illumination and lifts droplets out of low local contrast without
    reducing the crop to black/white regions.

    Not shared with detect_droplets, which runs its own independent
    threshold/watershed pipeline on the raw normalized crop; see
    detect_droplets."""
    flattened = subtract_background(plane)
    if flattened.size == 0 or flattened.max() <= flattened.min():
        return flattened

    enhanced = equalize_adapthist(flattened, clip_limit=CLAHE_CLIP_LIMIT)  # float64 in [0, 1]
    return (enhanced * 65535).astype(np.uint16)


def detect_droplets(plane: np.ndarray) -> tuple[int, list[tuple[int, int]]]:
    """Auto-count pipeline: subtract_background -> dark-background threshold
    -> fill-holes -> watershed to split touching droplets before counting
    regions. Independent of render_hand_count_image's grayscale render —
    neither shares any intermediate result with the other.

    Returns (count, points): count is the number of regions passing the
    area filter, and points is the (row, col) pixel coordinate of each
    surviving region's watershed seed — the same local maxima ImageJ's
    watershed uses as markers — one per counted droplet, for storing
    alongside cells.auto_count as an editable/inspectable grid."""
    if plane.size == 0:
        return 0, []

    flattened = subtract_background(plane)
    mask = threshold_binary(flattened)
    labels, coords = _fill_and_watershed(mask)
    if coords.size == 0:
        return 0, []

    kept_labels = {r.label for r in regionprops(labels) if r.area >= MIN_DROPLET_AREA_PX}
    points = [
        (int(row), int(col))
        for (row, col), label in zip(coords, range(1, len(coords) + 1))
        if label in kept_labels
    ]
    return len(points), points
