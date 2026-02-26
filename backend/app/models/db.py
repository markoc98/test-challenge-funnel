from __future__ import annotations

from typing import Literal, TypedDict

from pydantic import BaseModel, ConfigDict

ProcessingStatus = Literal["pending", "processing", "completed", "failed"]


class ImageRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    user_id: str | None = None
    filename: str | None = None
    original_path: str | None = None
    thumbnail_path: str | None = None


class ImageMetadataRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    image_id: int | None = None
    user_id: str | None = None
    ai_processing_status: ProcessingStatus | None = None
    tags: list[str] | None = None
    description: str | None = None
    colors: list[str] | None = None
    error_message: str | None = None


class MetadataMutationPayload(TypedDict, total=False):
    ai_processing_status: ProcessingStatus
    tags: list[str]
    description: str
    colors: list[str]
    error_message: str | None


class MetadataCreatePayload(MetadataMutationPayload):
    image_id: int
    user_id: str


class ImageUpdatePayload(TypedDict, total=False):
    thumbnail_path: str | None
