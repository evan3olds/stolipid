import numpy as np
from skimage.exposure import equalize_adapthist
from skimage.feature import peak_local_max
from skimage.filters import difference_of_gaussians, sobel, threshold_otsu
from skimage.measure import label, regionprops
from skimage.restoration import rolling_ball
from skimage.segmentation import watershed

# Prototype defaults, not yet calibrated against real microscopy images.
MIN_DROPLET_AREA_PX = 4
MIN_PEAK_DISTANCE_PX = 3
BACKGROUND_BALL_RADIUS_PX = 25  # larger than a droplet, smaller than the frame's illumination gradient
# 0.01 (skimage's default) visibly widens each droplet's footprint (FWHM
# 5px -> 9px on a real sample crop) by pulling the soft skirt left by
# rolling-ball subtraction up toward full brightness. 0.005 keeps most of
# the brightness gain (FWHM 7px) without that smeared look.
CLAHE_CLIP_LIMIT = 0.005

# count_droplets: iterative difference-of-Gaussians (DoG) band-pass sharpening.
DOG_LOW_SIGMA_PX = 1.0  # rejects pixel-level sensor noise
DOG_HIGH_SIGMA_PX = 6.0  # rejects structure wider than a droplet (droplet FWHM ~5-9px, see preprocess_for_detection)
SHARPEN_ITERATIONS = 3
SHARPEN_STRENGTH = 1.0  # weight of each iteration's band-pass edge response added back into the image
PEAK_THRESHOLD_REL = 0.1  # fraction of the sharpened image's dynamic range a local maximum must clear to seed a droplet


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
    """Iterative DoG band-pass sharpening -> local-maxima seeding ->
    edge-detection watershed on an already background-flattened/contrast-
    enhanced plane (see preprocess_for_detection).

    Each iteration runs a difference-of-Gaussians band-pass over the
    current image — subtracting a heavily-blurred copy from a
    lightly-blurred one rejects both pixel noise and structure wider than a
    droplet — and adds that edge response back in (unsharp-mask style), so
    droplet boundaries get progressively crisper and touching droplets
    separate before segmentation.

    Local maxima of the sharpened image seed one watershed marker per
    droplet center, and a Sobel gradient of the sharpened image supplies
    the watershed elevation map, so flooding halts at droplet edges rather
    than merging touching/overlapping droplets into one blob."""
    if processed.size == 0:
        return 0

    sharpened = processed.astype(np.float64)
    for _ in range(SHARPEN_ITERATIONS):
        edges = difference_of_gaussians(sharpened, DOG_LOW_SIGMA_PX, DOG_HIGH_SIGMA_PX)
        sharpened = sharpened + SHARPEN_STRENGTH * edges

    try:
        thresh = threshold_otsu(sharpened)
    except ValueError:
        return 0  # flat/constant crop, no meaningful threshold
    mask = sharpened > thresh

    if not mask.any():
        return 0

    coords = peak_local_max(
        sharpened, min_distance=MIN_PEAK_DISTANCE_PX, threshold_rel=PEAK_THRESHOLD_REL, labels=mask
    )
    if coords.size == 0:
        return 0

    seed_mask = np.zeros(sharpened.shape, dtype=bool)
    seed_mask[tuple(coords.T)] = True
    markers = label(seed_mask)

    elevation = sobel(sharpened)
    labels = watershed(elevation, markers, mask=mask)

    return sum(1 for r in regionprops(labels) if r.area >= MIN_DROPLET_AREA_PX)
