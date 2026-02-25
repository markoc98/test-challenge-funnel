import logging
from typing import Any

from app.services.ai_analyzer import AnalyzerError, get_image_analyzer
from app.services.supabase_service import SupabaseError, get_supabase_service
from app.services.image_service import extract_dominant_colors, create_thumbnail

logger = logging.getLogger(__name__)


def _thumbnail_path(user_id: str, image_id: int, original_path: str) -> str:
    filename = original_path.strip("/").split("/")[-1]
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{user_id}/thumbnails/{stem}_{image_id}.jpg"


async def process_image_job(
    image_id: int,
    user_id: str,
    image: Any,
) -> None:
    supabase = get_supabase_service()
    try:
        original_path = image.get("original_path")
        if not isinstance(original_path, str) or not original_path.strip():
            raise RuntimeError("Image original_path is missing.")

        image_url = supabase.create_signed_url(original_path, download=False)
        image_bytes, _ = supabase.download_bytes(original_path)

        thumbnail_bytes = create_thumbnail(image_bytes=image_bytes)
        thumbnail_path = _thumbnail_path(user_id=user_id, image_id=image_id, original_path=original_path)
        supabase.upload_object(
            object_path=thumbnail_path,
            payload=thumbnail_bytes,
            content_type="image/jpeg",
            upsert=True,
        )
        supabase.update_image(
            image_id=image_id,
            user_id=user_id,
            payload={"thumbnail_path": thumbnail_path},
        )

        analyzer = get_image_analyzer()
        analysis = await analyzer.analyze(image_url=image_url)
        colors = extract_dominant_colors(image_bytes=image_bytes, limit=3)

        supabase.upsert_metadata(
            image_id=image_id,
            user_id=user_id,
            payload={
                "ai_processing_status": "completed",
                "tags": analysis.tags,
                "description": analysis.description,
                "colors": colors,
                "error_message": None,
            },
        )
    except (AnalyzerError, SupabaseError, RuntimeError) as exc:
        logger.exception("Image processing failed for image_id=%s user_id=%s", image_id, user_id)
        try:
            supabase.upsert_metadata(
                image_id=image_id,
                user_id=user_id,
                payload={
                    "ai_processing_status": "failed",
                    "error_message": str(exc)[:500],
                },
            )
        except SupabaseError:
            logger.exception(
                "Failed to persist failure status for image_id=%s user_id=%s",
                image_id,
                user_id,
            )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Unexpected image processing failure for image_id=%s user_id=%s",
            image_id,
            user_id,
        )
        try:
            supabase.upsert_metadata(
                image_id=image_id,
                user_id=user_id,
                payload={
                    "ai_processing_status": "failed",
                    "error_message": f"Unexpected processing error: {str(exc)[:450]}",
                },
            )
        except SupabaseError:
            logger.exception(
                "Failed to persist unexpected failure status for image_id=%s user_id=%s",
                image_id,
                user_id,
            )
