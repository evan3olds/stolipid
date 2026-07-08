import numpy as np
from scipy import ndimage as ndi
from skimage.exposure import equalize_adapthist
from skimage.feature import peak_local_max
from skimage.filters import gaussian, threshold_otsu
from skimage.measure import label, regionprops
from skimage.restoration import rolling_ball
from skimage.segmentation import watershed

# Prototype defaults, not yet calibrated against real microscopy images.
MIN_DROPLET_AREA_PX = 4
MIN_PEAK_DISTANCE_PX = 3
BACKGROUND_BALL_RADIUS_PX = 25  # larger than a droplet, smaller than the frame's illumination gradient
CLAHE_CLIP_LIMIT = 0.01


def preprocess_for_detection(plane: np.ndarray) -> np.ndarray:
    """Rolling-ball background subtraction + CLAHE, returned as uint16.
    This is now both the image stored for hand counting/viewing
    (cells.image_url) and the direct input to count_droplets — one
    enhancement pass feeds both consumers, run once per box in
    cells_from_tif. Flattens uneven illumination and pulls out droplets
    that low local contrast would otherwise hide."""
    if plane.size == 0 or plane.max() <= plane.min():
        return plane.astype(np.uint16)  # empty/flat crop — let count_droplets's threshold_otsu guard handle it

    background = rolling_ball(plane, radius=BACKGROUND_BALL_RADIUS_PX)
    flattened = np.clip(plane.astype(np.float64) - background, 0, 65535).astype(np.uint16)
    if flattened.max() <= flattened.min():
        # equalize_adapthist fabricates full-range contrast out of a flat
        # image (pure tiling artifact, not signal) — bail before that happens.
        return flattened

    enhanced = equalize_adapthist(flattened, clip_limit=CLAHE_CLIP_LIMIT)  # float64 in [0, 1]
    return (enhanced * 65535).astype(np.uint16)


def count_droplets(processed: np.ndarray) -> int:
    """Gaussian blur -> Otsu threshold -> distance-transform watershed on an
    already background-flattened/contrast-enhanced plane (see
    preprocess_for_detection). Watershed splits touching/overlapping
    droplets so each still gets its own count, which a plain threshold+label
    would merge into one blob."""
    if processed.size == 0:
        return 0

    blurred = gaussian(processed, sigma=1.0, preserve_range=True)

    try:
        thresh = threshold_otsu(blurred)
    except ValueError:
        return 0  # flat/constant crop, no meaningful threshold
    mask = blurred > thresh

    if not mask.any():
        return 0

    distance = ndi.distance_transform_edt(mask)
    # Smooth the distance map before peak-finding: the raw transform often
    # has a shallow local maximum right on the saddle ridge between two
    # touching blobs (its distance-to-background is only marginally lower
    # than the two true centers), which peak_local_max would otherwise
    # count as a third, spurious droplet.
    smoothed_distance = ndi.gaussian_filter(distance, sigma=1.5)
    coords = peak_local_max(smoothed_distance, min_distance=MIN_PEAK_DISTANCE_PX, labels=mask)
    if coords.size == 0:
        return 0

    seed_mask = np.zeros(distance.shape, dtype=bool)
    seed_mask[tuple(coords.T)] = True
    markers = label(seed_mask)

    labels = watershed(-distance, markers, mask=mask)

    return sum(1 for r in regionprops(labels) if r.area >= MIN_DROPLET_AREA_PX)
