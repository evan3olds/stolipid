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


def load_tif_plane(tif_bytes: bytes) -> np.ndarray:
    """Raw 2D float64 intensity plane, no normalization — the shared input
    for both the display render and quantitative analysis (api/detection.py)."""
    try:
        array = tifffile.imread(io.BytesIO(tif_bytes))
    except Exception as e:
        raise ValueError(f"Could not read TIFF file: {e}")
    return _to_2d_plane(np.asarray(array)).astype(np.float64)


def render_display_image(plane: np.ndarray) -> Image.Image:
    """Percentile-stretched, green false-color 8-bit RGB — for human viewing
    only. Lossy (clips the 1st/99.5th percentile tails), so this is not a
    valid input for quantitative analysis — see load_tif_plane."""
    low, high = np.percentile(plane, [1, 99.5])
    if high <= low:
        normalized = np.zeros_like(plane, dtype=np.uint8)
    else:
        stretched = np.clip((plane - low) / (high - low), 0, 1)
        normalized = (stretched * 255).astype(np.uint8)

    height, width = normalized.shape
    rgb = np.zeros((height, width, 3), dtype=np.uint8)
    rgb[:, :, 1] = normalized  # green false-color LUT (BODIPY channel)

    return Image.fromarray(rgb, mode="RGB")


def render_tif_to_image(tif_bytes: bytes) -> Image.Image:
    return render_display_image(load_tif_plane(tif_bytes))


def encode_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
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


def crop_percent(image: Image.Image, x: float, y: float, width: float, height: float) -> Image.Image:
    left, top, right, bottom = _crop_pixel_rect(image.width, image.height, x, y, width, height)
    return image.crop((left, top, right, bottom))


def crop_array_percent(plane: np.ndarray, x: float, y: float, width: float, height: float) -> np.ndarray:
    """Same pixel-rect math as crop_percent, for the raw analysis plane
    instead of the display PIL.Image, so the two stay spatially aligned."""
    img_height, img_width = plane.shape
    left, top, right, bottom = _crop_pixel_rect(img_width, img_height, x, y, width, height)
    return plane[top:bottom, left:right]
