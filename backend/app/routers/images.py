from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.config import get_settings
from app.models.schemas import (
    ProcessImageRequest,
    ProcessImageResponse,
    SimilarImageMatch,
    SimilarImageQueryMetadata,
    SimilarImageScoreBreakdown,
    SimilarImagesRequest,
    SimilarImagesResponse,
)
from app.processing.pipeline import process_image_job
from app.services.auth import UserId
from app.services.similarity import SimilarityError, SimilarityService, get_similarity_service
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


def get_similarity() -> SimilarityService:
    return get_similarity_service()


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


@router.post("/images/similar", response_model=SimilarImagesResponse)
async def find_similar_images(
    payload: SimilarImagesRequest,
    user_id: UserId,
    supabase: SupabaseService = Depends(get_supabase),
    similarity: SimilarityService = Depends(get_similarity),
) -> SimilarImagesResponse:
    settings = get_settings()

    image = supabase.get_image(image_id=payload.image_id, user_id=user_id)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found.",
        )

    metadata_rows = supabase.list_completed_metadata(user_id=user_id)
    candidates = similarity.from_metadata_rows(metadata_rows)

    try:
        query, scored = similarity.rank_similar(
            query_image_id=payload.image_id,
            candidates=candidates,
            top_k=settings.similarity_top_k,
        )
    except SimilarityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Image metadata is not ready for similarity search.",
        ) from exc

    image_lookup = supabase.get_images_by_ids(
        user_id=user_id,
        image_ids=[row.image_id for row in scored],
    )

    matches: list[SimilarImageMatch] = []
    threshold = settings.similarity_match_threshold
    for row in scored:
        is_match = row.score >= threshold
        if not is_match:
            continue
        image_row = image_lookup.get(row.image_id)
        matches.append(
            SimilarImageMatch(
                image_id=row.image_id,
                filename=image_row.filename if image_row else None,
                original_path=image_row.original_path if image_row else None,
                thumbnail_path=image_row.thumbnail_path if image_row else None,
                score=row.score,
                is_match=is_match,
                tags=row.tags,
                colors=row.colors,
                description=row.description,
                score_breakdown=SimilarImageScoreBreakdown(
                    cosine=row.cosine,
                    rare_tag_boost=row.rare_tag_boost,
                    rare_tags=row.rare_tags,
                ),
            )
        )

    return SimilarImagesResponse(
        query=SimilarImageQueryMetadata(
            image_id=query.image_id,
            tags=query.tags,
            colors=query.colors,
            description=query.description,
        ),
        match_threshold=threshold,
        matches=matches,
    )
