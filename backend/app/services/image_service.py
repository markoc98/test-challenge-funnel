from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError


class ThumbnailError(Exception):
    """Raised when the thumbnail cannot be created."""

def create_thumbnail(
    image_bytes: bytes,
    size: int = 300,
    output_format: str = "JPEG",
) -> bytes:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            resampling = getattr(Image, "Resampling", Image).LANCZOS
            image = ImageOps.fit(image, (size, size), method=resampling, centering=(0.5, 0.5))

            output = BytesIO()
            image.save(output, format=output_format, quality=90, optimize=True)
            return output.getvalue()
    except UnidentifiedImageError as exc:
        raise ThumbnailError("Unsupported image file.") from exc
    except OSError as exc:
        raise ThumbnailError("Invalid image payload.") from exc

def extract_dominant_colors(image_bytes: bytes, limit: int = 3, palette_size: int = 12) -> list[str]:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((512, 512))

            pal = image.quantize(colors=max(palette_size, limit), method=Image.Quantize.MEDIANCUT)
            counts = pal.getcolors() or []  # [(count, palette_index), ...]

            # sort by count desc
            counts.sort(key=lambda x: x[0], reverse=True)

            palette = pal.getpalette() or []
            dominant = []

            for count, idx in counts:
                base = idx * 3
                if base + 2 >= len(palette):
                    continue
                r, g, b = palette[base:base+3]
                hex_color = f"#{r:02X}{g:02X}{b:02X}"
                if hex_color not in dominant:
                    dominant.append(hex_color)
                if len(dominant) >= limit:
                    break

            return dominant
    except (UnidentifiedImageError, OSError):
        return []
    