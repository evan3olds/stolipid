import numpy as np
from scipy import ndimage as ndi
from skimage.exposure import equalize_adapthist
from skimage.feature import peak_local_max
from skimage.filters import sobel, threshold_otsu
from skimage.measure import regionprops
from skimage.morphology import h_maxima
from skimage.restoration import rolling_ball
from skimage.segmentation import watershed

# Prototype defaults, not yet calibrated against real microscopy images.
# Used only by _detect_droplets_otsu_watershed (see DETECTION_ALGORITHMS).
MIN_DROPLET_AREA_PX = 4
MIN_PEAK_DISTANCE_PX = 3
BACKGROUND_BALL_RADIUS_PX = 12
# Multiplier on Otsu's threshold. >1 raises the cutoff so only the brighter
# cores of clumped/touching droplets pass, shrinking the foreground mask
# and pulling touching droplets apart before fill-holes/watershed even run.
THRESHOLD_FACTOR = 1.5
# CLAHE clip limit for the stored hand-count image (render_hand_count_image
# only — neither detect_droplets algorithm uses this). Previously tuned
# 0.01 -> 0.005 because skimage's 0.01 default visibly widened each
# droplet's footprint (a smeared/blurred look); 0.003 trims that smearing
# further while still lifting droplets out of low local contrast.
CLAHE_CLIP_LIMIT = 0.003

# Fixed parameters for _detect_droplets_fm_edge_overlay, ported from the
# lab's assets/ALDQ.ijm-20181102151807.txt macro's settings dialog — hardcoded
# here instead of prompting, per the user's fixed values.
FM_PREPROCESS_ITERATIONS = 3         # "Segmentation Cycles" / amplicycle
FM_BLUR_DURING_SIGMA = 1             # "Blur During Segmentation Cycles" / varblurring
FM_BLUR_AFTER_SIGMA = 1              # "Blur-Sigma After Segmentation" / blurafteramplinumber
FM_FIND_MAXIMA_NOISE = 4000          # "Find Maximum Noise Tolerance" / FindMaximum
FM_LOCAL_THRESHOLD_RADIUS = 10       # "Auto Local Threshold Radius" / ALT (Phansalkar)
FM_MIN_PARTICLE_AREA_PX = 15         # "Minimum Particle Size" / lowersize
FM_MAX_PARTICLE_AREA_PX = 1_000_000  # "Maximum Particle Size" / uppersize
FM_MIN_CIRCULARITY = 0.4             # "Minimum Particle Circularity" / lowercircularity
FM_MAX_CIRCULARITY = 1.0             # "Maximum Particle Circularity" / uppercircularity
# Reserved: the macro's "Classic Watershed Blurring" (varwsblurring) and
# per-image pixel size only feed the macro's optional LD-volume / Classic
# Watershed flooding branch, which this port doesn't implement — every
# size/circularity threshold above is pixel-based, so pixel size has no
# effect on detection math. Kept here so the hardcoded-parameter set stays
# traceable to the macro's dialog.
FM_CLASSIC_WATERSHED_BLUR_RESERVED = 2
FM_PIXEL_SIZE_UM_RESERVED = 6.5

# Fiji's Auto_Local_Threshold plugin's built-in Phansalkar defaults — the
# macro calls it with parameter_1=0 parameter_2=0, i.e. "use defaults".
_PHANSALKAR_K = 0.25
_PHANSALKAR_R = 0.5
_PHANSALKAR_P = 2.0
_PHANSALKAR_Q = 10.0

DETECTION_ALGORITHMS = ("otsu_watershed", "fm_edge_overlay")


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
    watershed), used by _detect_droplets_otsu_watershed and (labels only) by
    _edge_particle_mask.

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

    Not shared with either detect_droplets algorithm, which each run their
    own independent pipeline on the raw normalized crop; see
    detect_droplets."""
    flattened = subtract_background(plane)
    if flattened.size == 0 or flattened.max() <= flattened.min():
        return flattened

    enhanced = equalize_adapthist(flattened, clip_limit=CLAHE_CLIP_LIMIT)  # float64 in [0, 1]
    return (enhanced * 65535).astype(np.uint16)


def _detect_droplets_otsu_watershed(plane: np.ndarray) -> tuple[int, list[tuple[int, int]]]:
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


def _iterative_sharpen(image: np.ndarray, iterations: int, sigma: float) -> np.ndarray:
    """ALDQ.ijm's sixteenbitsegmentation(): repeated unsharp-mask add-back.
    Each cycle highpass-filters the image (blur, subtract, clip negative to
    0, re-blur) and adds that back onto the running image, clipped to the
    16-bit range every cycle (the macro converts back to 16-bit after each
    cycle too). Only the macro's 16-bit branch is needed here since
    normalize_to_uint16 (api/imaging.py) already puts every crop on a
    0-65535 scale before detect_droplets ever sees it."""
    working = image.astype(np.float64)
    for _ in range(iterations):
        blurred = ndi.gaussian_filter(working, sigma)
        highpass = np.clip(working - blurred, 0, None)  # "Subtract create" + Apply LUT clip to 0
        highpass_blurred = ndi.gaussian_filter(highpass, sigma)
        working = np.clip(working + highpass_blurred, 0, 65535)  # "Add create 32-bit" -> back to 16-bit
    return working


def _phansalkar_threshold(image_u8: np.ndarray, radius: int) -> np.ndarray:
    """Phansalkar local threshold, matching Fiji's Auto_Local_Threshold
    plugin's built-in defaults (k=0.25, r=0.5, p=2, q=10 — the macro calls
    it with parameter_1=0 parameter_2=0, i.e. "use defaults"). Returns a
    boolean mask, True where the pixel is brighter than its local threshold
    ("white" objects, matching the macro's "...radius=ALT ... white")."""
    normalized = image_u8.astype(np.float64) / 255.0
    size = 2 * radius + 1
    mean = ndi.uniform_filter(normalized, size=size)
    variance = np.clip(ndi.uniform_filter(normalized**2, size=size) - mean**2, 0, None)
    std = np.sqrt(variance)
    threshold = mean * (1 + _PHANSALKAR_P * np.exp(-_PHANSALKAR_Q * mean)
                         + _PHANSALKAR_K * (std / _PHANSALKAR_R - 1))
    return normalized > threshold


def _edge_particle_mask(image: np.ndarray) -> np.ndarray:
    """Reproduces the macro's LD-edge particle mask (lines ~1070-1084 of
    ALDQ.ijm): Find Edges (Sobel) -> 8-bit -> Phansalkar local threshold ->
    invert -> fill holes -> watershed (via the shared _fill_and_watershed
    helper) -> keep only regions within the size/circularity bounds.

    Returns a boolean mask, True inside an accepted lipid-droplet particle."""
    edges = sobel(image)
    low, high = edges.min(), edges.max()
    if high <= low:
        edges_u8 = np.zeros_like(edges, dtype=np.uint8)
    else:
        edges_u8 = ((edges - low) / (high - low) * 255).astype(np.uint8)  # matches ImageJ's run("8-bit")

    thresholded = _phansalkar_threshold(edges_u8, FM_LOCAL_THRESHOLD_RADIUS)
    labels, _ = _fill_and_watershed(~thresholded)  # Invert, then fill holes + watershed

    mask = np.zeros(labels.shape, dtype=bool)
    for region in regionprops(labels):
        perimeter = region.perimeter
        circularity = 1.0 if perimeter == 0 else min(4 * np.pi * region.area / perimeter**2, 1.0)
        if (FM_MIN_PARTICLE_AREA_PX <= region.area <= FM_MAX_PARTICLE_AREA_PX
                and FM_MIN_CIRCULARITY <= circularity <= FM_MAX_CIRCULARITY):
            mask[labels == region.label] = True
    return mask


def _find_maxima(image: np.ndarray, noise_tolerance: float) -> list[tuple[int, int]]:
    """ImageJ's Find Maxima (noise-tolerance / prominence-based single-pixel
    peaks) is best matched by the h-maxima transform: a maximum survives if
    no path to a higher peak stays within noise_tolerance of its own height
    — the same definition ImageJ's MaximumFinder uses. Each surviving
    (possibly multi-pixel) plateau is reduced to its single brightest pixel,
    matching ImageJ's output=[Point Selection]."""
    peaks = h_maxima(image, noise_tolerance)
    labeled, n = ndi.label(peaks)
    points = []
    for label in range(1, n + 1):
        region_mask = labeled == label
        local_image = np.where(region_mask, image, -np.inf)
        points.append(tuple(int(c) for c in np.unravel_index(np.argmax(local_image), image.shape)))
    return points


def _detect_droplets_fm_edge_overlay(plane: np.ndarray) -> tuple[int, list[tuple[int, int]]]:
    """Direct port of ALDQ.ijm's "FM_edge_overlay" LD-determination steps
    (lines ~1058-1230), with the lab's dialog parameters hardcoded (no
    prompts): iterative highpass-sharpening -> two independent branches off
    that sharpened image — (1) an edge/threshold/watershed particle mask
    filtered by size+circularity, and (2) a further-blurred Find Maxima
    pass. A maximum only counts as a lipid droplet if it lands on a pixel
    the particle mask accepted, per the macro's own comment: "Local maxima
    that were not located on edge defined particles are lost here!" — that
    intersection is exactly what the macro calls FM_edge_overlay.

    The macro achieves the intersection via an ImageJ-specific pixel-
    arithmetic trick (Subtract create + Invert on a point-selection-
    restricted Apply LUT) whose exact semantics can't be verified without
    Fiji itself; this port implements the stated intent directly (a simple
    mask lookup per maximum) instead.

    Returns (count, points): count is the number of maxima that survived,
    and points is their (row, col) pixel coordinates — the "grid" of where
    each lipid droplet was counted, for cells.auto_points."""
    if plane.size == 0:
        return 0, []

    sharpened = _iterative_sharpen(plane, FM_PREPROCESS_ITERATIONS, FM_BLUR_DURING_SIGMA)
    particle_mask = _edge_particle_mask(sharpened)

    blurred = ndi.gaussian_filter(sharpened, FM_BLUR_AFTER_SIGMA)
    maxima = _find_maxima(blurred, FM_FIND_MAXIMA_NOISE)

    points = [pt for pt in maxima if particle_mask[pt]]
    return len(points), points


def detect_droplets(
    plane: np.ndarray, algorithm: str = "otsu_watershed"
) -> tuple[int, list[tuple[int, int]]]:
    """Auto-count dispatcher. algorithm selects which independent pipeline
    runs — "otsu_watershed" (default, unchanged prototype behavior) or
    "fm_edge_overlay" (ALDQ.ijm-faithful port, see
    _detect_droplets_fm_edge_overlay) — chosen per upload from the Add
    Photos screen (api/main.py's cells_from_tif, app.js's addPhotosState).

    Returns (count, points), same shape from either algorithm."""
    if algorithm not in DETECTION_ALGORITHMS:
        raise ValueError(f"Unknown detection algorithm: {algorithm!r}")
    if algorithm == "fm_edge_overlay":
        return _detect_droplets_fm_edge_overlay(plane)
    return _detect_droplets_otsu_watershed(plane)
