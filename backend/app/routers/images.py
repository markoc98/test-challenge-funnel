from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.models.schemas import ProcessImageRequest, ProcessImageResponse
from app.processing.pipeline import process_image_job
from app.services.auth import UserId
from app.services.supabase_service import SupabaseService, get_supabase_service

router = APIRouter(prefix="/api", tags=["images"])


def get_supabase() -> SupabaseService:
    try:
        return get_supabase_service()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post("/process-image", response_model=ProcessImageResponse)
async def process_image(
    payload: ProcessImageRequest,
    background_tasks: BackgroundTasks,
    user_id: UserId,
    supabase: SupabaseService = Depends(get_supabase),
) -> ProcessImageResponse:
    if payload.image_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload.",
        )

    image = supabase.get_image(image_id=payload.image_id, user_id=user_id)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found.",
        )

    background_tasks.add_task(process_image_job, payload.image_id, user_id, image)

    return ProcessImageResponse(message="All good.")
