import numpy as np
from scipy import ndimage as ndi
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


def subtract_background(plane: np.ndarray) -> np.ndarray:
    """Rolling-ball background subtraction (radius 12px), returned as
    uint16. Flattens uneven illumination — step 1 of the shared
    hand-count/auto-count pipeline (see threshold_binary, count_droplets)."""
    if plane.size == 0 or plane.max() <= plane.min():
        return plane.astype(np.uint16)  # empty/flat crop — let threshold_binary's guard handle it

    background = rolling_ball(plane, radius=BACKGROUND_BALL_RADIUS_PX)
    return np.clip(plane.astype(np.float64) - background, 0, 65535).astype(np.uint16)


def threshold_binary(flattened: np.ndarray) -> np.ndarray:
    """Otsu threshold against a dark background (foreground = bright
    droplets), scaled by THRESHOLD_FACTOR and returned as a boolean mask.
    Step 2 of the shared hand-count/auto-count pipeline — equivalent to
    ImageJ's Image > Adjust > Threshold with "Dark background", applied."""
    if flattened.size == 0 or flattened.max() <= flattened.min():
        return np.zeros_like(flattened, dtype=bool)

    try:
        thresh = threshold_otsu(flattened) * THRESHOLD_FACTOR
    except ValueError:
        return np.zeros_like(flattened, dtype=bool)  # flat/constant crop, no meaningful threshold
    return flattened > thresh


def segment_droplets(plane: np.ndarray) -> np.ndarray:
    """Full pipeline, shared by both the stored hand-count image and the
    auto-count: background subtraction -> dark-background threshold -> fill
    holes -> distance-transform watershed -> labeled regions.

    Filling holes closes out-of-focus droplet centers that threshold_binary
    would otherwise leave as gaps in the mask. A Euclidean distance
    transform of the filled mask seeds one watershed marker per droplet
    center (its local maxima), and flooding the inverted distance map halts
    at droplet edges — ImageJ's Process > Binary > Watershed — so touching
    droplets separate into distinct regions. `watershed_line=True` burns a
    1px background gap into those splits, so render_hand_count_image can
    show separated droplets rather than one merged blob.

    Returns an int label array: 0 is background (including watershed split
    lines), 1..N is one label per droplet region."""
    if plane.size == 0:
        return np.zeros(plane.shape, dtype=int)

    flattened = subtract_background(plane)
    mask = threshold_binary(flattened)
    if not mask.any():
        return np.zeros(plane.shape, dtype=int)

    filled = ndi.binary_fill_holes(mask)

    distance = ndi.distance_transform_edt(filled)
    coords = peak_local_max(distance, min_distance=MIN_PEAK_DISTANCE_PX, labels=filled)
    if coords.size == 0:
        return np.zeros(plane.shape, dtype=int)

    markers = np.zeros(distance.shape, dtype=int)
    markers[tuple(coords.T)] = np.arange(1, len(coords) + 1)

    return watershed(-distance, markers, mask=filled, watershed_line=True)


def render_hand_count_image(labels: np.ndarray) -> np.ndarray:
    """Binary uint16 (0 or 65535) rendering of segment_droplets's output,
    stored for hand counting/viewing (cells.image_url). Watershed's split
    lines are already burned in as background, so droplets that were
    touching/clumped in the raw image appear visually separated here."""
    return (labels > 0).astype(np.uint16) * 65535


def count_droplets(labels: np.ndarray) -> int:
    """Counts droplet regions from segment_droplets's output — the same
    watershed segmentation used to render the stored hand-count image."""
    return sum(1 for r in regionprops(labels) if r.area >= MIN_DROPLET_AREA_PX)
