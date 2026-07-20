import io

import numpy as np
import tifffile
from PIL import Image


def _to_2d_plane(array: np.ndarray) -> np.ndarray:
    if array.ndim == 2:
        return array
    if array.ndim == 3:
        # Assume the smallest axis is a channel/z-stack dimension and take
        # its first plane — this pipeline targets single-channel BODIPY
        # captures, not multi-channel composites or z-stacks.
        axis = int(np.argmin(array.shape))
        return np.take(array, 0, axis=axis)
    raise ValueError(f"Cannot reduce a {array.ndim}-dimensional TIFF to a single 2D plane")


def _read_plane_native(tif_bytes: bytes) -> np.ndarray:
    """2D plane in its original on-disk dtype (no float upcast yet) — the
    shared first step before either the full-precision analysis path
    (load_tif_plane) or the downsampled preview path (render_tif_to_image).
    Keeping this upcast-free means downsampling a large slide for preview
    (see render_tif_to_image) only ever copies the small, already-strided
    array, not the full-resolution one."""
    try:
        array = tifffile.imread(io.BytesIO(tif_bytes))
    except Exception as e:
        raise ValueError(f"Could not read TIFF file: {e}")
    return _to_2d_plane(np.asarray(array))


def load_tif_plane(tif_bytes: bytes) -> np.ndarray:
    """Raw 2D float32 intensity plane, no normalization — the shared input
    for both the display render and quantitative analysis (api/detection.py).
    float32 rather than float64: halves per-request memory on Render, and
    values are renormalized to uint16 immediately after cropping anyway
    (see normalize_to_uint16), so the extra float64 precision was never
    used."""
    return _read_plane_native(tif_bytes).astype(np.float32)


def render_display_image(plane: np.ndarray) -> Image.Image:
    """Percentile-stretched, 8-bit grayscale — for human viewing only. Lossy
    (clips the 1st/99.5th percentile tails), so this is not a valid input
    for quantitative analysis — see load_tif_plane."""
    low, high = np.percentile(plane, [1, 99.5])
    if high <= low:
        normalized = np.zeros_like(plane, dtype=np.uint8)
    else:
        stretched = np.clip((plane - low) / (high - low), 0, 1)
        normalized = (stretched * 255).astype(np.uint8)

    return Image.fromarray(normalized, mode="L")


# Add Photos boxes are stored as percentages of the canvas frame, which are
# resolution-independent, and cells_from_tif re-reads the source .tif at
# full resolution when it actually crops a cell — so the preview render
# never needs full resolution and can be capped here to bound per-request
# memory on Render (this was the main driver of OOM crashes when several
# large .tifs were selected at once).
PREVIEW_MAX_DIMENSION = 2048


def _downsample(plane: np.ndarray, max_dimension: int) -> np.ndarray:
    height, width = plane.shape
    step = max(1, -(-max(height, width) // max_dimension))  # ceil div
    return plane[::step, ::step] if step > 1 else plane


def render_tif_to_image(tif_bytes: bytes) -> Image.Image:
    native = _read_plane_native(tif_bytes)
    downsampled = _downsample(native, PREVIEW_MAX_DIMENSION)
    return render_display_image(downsampled.astype(np.float32))


def encode_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def normalize_to_uint16(plane: np.ndarray) -> np.ndarray:
    """Linear min/max stretch to fill the 16-bit range. Unlike
    render_display_image's percentile clip, this is a strictly monotonic
    transform of the crop's own actual min/max — no data is discarded, so
    detection.detect_droplets (Otsu threshold + watershed) gives the same
    result on the normalized crop as on the raw plane."""
    low, high = plane.min(), plane.max()
    if high <= low:
        return np.zeros_like(plane, dtype=np.uint16)
    stretched = (plane - low) / (high - low)
    return (stretched * 65535).astype(np.uint16)


def encode_png_16(plane: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(plane.astype(np.uint16)).save(buffer, format="PNG")
    return buffer.getvalue()


def _crop_pixel_rect(img_width: int, img_height: int, x: float, y: float, width: float, height: float):
    left = int(round(np.clip(x, 0, 100) / 100 * img_width))
    top = int(round(np.clip(y, 0, 100) / 100 * img_height))
    right = int(round(np.clip(x + width, 0, 100) / 100 * img_width))
    bottom = int(round(np.clip(y + height, 0, 100) / 100 * img_height))

    right = max(right, left + 1)
    bottom = max(bottom, top + 1)
    right = min(right, img_width)
    bottom = min(bottom, img_height)

    return left, top, right, bottom


def crop_array_percent(plane: np.ndarray, x: float, y: float, width: float, height: float) -> np.ndarray:
    """Same pixel-rect math as crop_percent, for the raw analysis plane
    instead of the display PIL.Image, so the two stay spatially aligned."""
    img_height, img_width = plane.shape
    left, top, right, bottom = _crop_pixel_rect(img_width, img_height, x, y, width, height)
    return plane[top:bottom, left:right]
