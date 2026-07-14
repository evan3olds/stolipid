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


def _fill_and_watershed(mask: np.ndarray, watershed_line: bool) -> np.ndarray:
    """Shared mechanics for steps 3+ (fill holes -> distance-transform
    watershed), called independently by render_hand_count_image and
    count_droplets — each passes its own mask instance, so the two never
    share a single watershed computation.

    Filling holes closes out-of-focus droplet centers that threshold_binary
    would otherwise leave as gaps in the mask. A Euclidean distance
    transform of the filled mask seeds one watershed marker per droplet
    center (its local maxima), and flooding the inverted distance map halts
    at droplet edges — ImageJ's Process > Binary > Watershed — so touching
    droplets separate into distinct regions.

    Returns an int label array: 0 is background, 1..N is one label per
    droplet region."""
    if not mask.any():
        return np.zeros(mask.shape, dtype=int)

    filled = ndi.binary_fill_holes(mask)

    distance = ndi.distance_transform_edt(filled)
    coords = peak_local_max(distance, min_distance=MIN_PEAK_DISTANCE_PX, labels=filled)
    if coords.size == 0:
        return np.zeros(mask.shape, dtype=int)

    markers = np.zeros(distance.shape, dtype=int)
    markers[tuple(coords.T)] = np.arange(1, len(coords) + 1)

    return watershed(-distance, markers, mask=filled, watershed_line=watershed_line)


def render_hand_count_image(plane: np.ndarray) -> np.ndarray:
    """Full pipeline run only for the stored hand-count image
    (cells.image_url): background subtraction -> dark-background threshold
    -> fill holes -> distance-transform watershed. `watershed_line=True`
    burns a 1px background gap between touching droplets, so droplets that
    were merged in the mask appear visually separated in the stored image.

    This watershed pass is not shared with count_droplets — the auto-count
    pipeline reruns its own subtract_background/threshold_binary and its
    own watershed independently; see count_droplets."""
    if plane.size == 0:
        return plane.astype(np.uint16)

    flattened = subtract_background(plane)
    mask = threshold_binary(flattened)
    labels = _fill_and_watershed(mask, watershed_line=True)
    return (labels > 0).astype(np.uint16) * 65535


def count_droplets(plane: np.ndarray) -> int:
    """Auto-count pipeline. Starts from its own subtract_background ->
    threshold_binary pass — the same two steps render_hand_count_image
    runs, but recomputed independently here rather than reusing that
    result — then its own fill-holes -> watershed (no visible split line
    needed, since nothing here gets rendered) to split touching droplets
    before counting regions."""
    if plane.size == 0:
        return 0

    flattened = subtract_background(plane)
    mask = threshold_binary(flattened)
    labels = _fill_and_watershed(mask, watershed_line=False)
    return sum(1 for r in regionprops(labels) if r.area >= MIN_DROPLET_AREA_PX)
