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
    droplets), returned as a boolean mask. Step 2 of the shared
    hand-count/auto-count pipeline — equivalent to ImageJ's
    Image > Adjust > Threshold with "Dark background", applied."""
    if flattened.size == 0 or flattened.max() <= flattened.min():
        return np.zeros_like(flattened, dtype=bool)

    try:
        thresh = threshold_otsu(flattened)
    except ValueError:
        return np.zeros_like(flattened, dtype=bool)  # flat/constant crop, no meaningful threshold
    return flattened > thresh


def preprocess_for_hand_count(plane: np.ndarray) -> np.ndarray:
    """Background-subtracted + binary-thresholded image (steps 1-2 of the
    shared pipeline, see count_droplets for the rest), stored for hand
    counting/viewing (cells.image_url). Returned as uint16 (0 or 65535)."""
    flattened = subtract_background(plane)
    mask = threshold_binary(flattened)
    return mask.astype(np.uint16) * 65535


def count_droplets(plane: np.ndarray) -> int:
    """Background subtraction -> dark-background threshold -> fill holes ->
    mask -> watershed (see preprocess_for_hand_count for steps 1-2, shared
    with the stored hand-count image).

    Filling holes closes out-of-focus droplet centers that threshold_binary
    would otherwise leave as gaps in the mask. A Euclidean distance
    transform of the filled mask seeds one watershed marker per droplet
    center (its local maxima), and flooding the inverted distance map halts
    at droplet edges — ImageJ's Process > Binary > Watershed — so touching
    droplets separate before counting connected regions."""
    if plane.size == 0:
        return 0

    flattened = subtract_background(plane)
    mask = threshold_binary(flattened)
    if not mask.any():
        return 0

    filled = ndi.binary_fill_holes(mask)

    distance = ndi.distance_transform_edt(filled)
    coords = peak_local_max(distance, min_distance=MIN_PEAK_DISTANCE_PX, labels=filled)
    if coords.size == 0:
        return 0

    markers = np.zeros(distance.shape, dtype=int)
    markers[tuple(coords.T)] = np.arange(1, len(coords) + 1)

    labels = watershed(-distance, markers, mask=filled)

    return sum(1 for r in regionprops(labels) if r.area >= MIN_DROPLET_AREA_PX)
