from __future__ import annotations

from functools import lru_cache
import mimetypes
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError
from supabase import Client, create_client

from app.config import get_settings
from app.models.db import (
    ImageMetadataRecord,
    ImageRecord,
    ImageUpdatePayload,
    MetadataCreatePayload,
    MetadataMutationPayload,
)

ModelT = TypeVar("ModelT", bound=BaseModel)


class SupabaseError(Exception):
    """Raised for Supabase REST and Storage API failures."""


class SupabaseService:
    def __init__(self, base_url: str, secret_key: str, bucket: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._bucket = bucket
        self._client: Client = create_client(self._base_url, secret_key)

    @staticmethod
    def _rows(response: Any) -> list[dict[str, Any]]:
        data = getattr(response, "data", None)
        if data is None:
            return []
        if isinstance(data, dict):
            return [data]
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        return []

    @staticmethod
    def _to_bytes(content: Any) -> bytes:
        if isinstance(content, bytes):
            return content
        if isinstance(content, bytearray):
            return bytes(content)
        if hasattr(content, "read"):
            loaded = content.read()
            if isinstance(loaded, bytes):
                return loaded
        if hasattr(content, "content") and isinstance(content.content, (bytes, bytearray)):
            return bytes(content.content)
        raise SupabaseError("Supabase storage download returned an unexpected payload type.")

    @staticmethod
    def _clean_path(object_path: str) -> str:
        return object_path.lstrip("/")

    def _execute_rows(self, query: Any, *, context: str) -> list[dict[str, Any]]:
        try:
            response = query.execute()
        except Exception as exc:  # noqa: BLE001
            raise SupabaseError(f"Supabase operation failed while {context}: {exc}") from exc
        return self._rows(response)

    @staticmethod
    def _validate_row(row: dict[str, Any], *, model: type[ModelT], context: str) -> ModelT:
        try:
            return model.model_validate(row)
        except ValidationError as exc:
            raise SupabaseError(
                f"Supabase returned invalid {model.__name__} data while {context}: {exc}"
            ) from exc

    def _execute_typed_rows(
        self,
        query: Any,
        *,
        model: type[ModelT],
        context: str,
    ) -> list[ModelT]:
        return [
            self._validate_row(row, model=model, context=context)
            for row in self._execute_rows(query, context=context)
        ]

    def get_image(self, image_id: int, user_id: str) -> ImageRecord | None:
        rows = self._execute_typed_rows(
            self._client.table("images")
            .select("id,user_id,filename,original_path,thumbnail_path")
            .eq("id", image_id)
            .eq("user_id", user_id)
            .limit(1),
            model=ImageRecord,
            context=f"fetching image {image_id}",
        )
        return rows[0] if rows else None

    def get_metadata(self, image_id: int, user_id: str) -> ImageMetadataRecord | None:
        rows = self._execute_typed_rows(
            self._client.table("image_metadata")
            .select("id,image_id,user_id,ai_processing_status,tags,description,colors,error_message")
            .eq("image_id", image_id)
            .eq("user_id", user_id)
            .limit(1),
            model=ImageMetadataRecord,
            context=f"fetching metadata for image {image_id}",
        )
        return rows[0] if rows else None

    def create_metadata(self, payload: MetadataCreatePayload) -> ImageMetadataRecord:
        rows = self._execute_typed_rows(
            self._client.table("image_metadata").insert(payload),
            model=ImageMetadataRecord,
            context="creating image metadata",
        )
        if not rows:
            raise SupabaseError("Supabase did not return the inserted metadata row.")
        return rows[0]

    def update_metadata(
        self,
        metadata_id: int,
        payload: MetadataMutationPayload,
    ) -> ImageMetadataRecord:
        rows = self._execute_typed_rows(
            self._client.table("image_metadata")
            .update(payload)
            .eq("id", metadata_id),
            model=ImageMetadataRecord,
            context=f"updating metadata {metadata_id}",
        )
        if not rows:
            raise SupabaseError(f"Metadata row {metadata_id} was not updated.")
        return rows[0]

    def upsert_metadata(
        self,
        image_id: int,
        user_id: str,
        payload: MetadataMutationPayload,
    ) -> ImageMetadataRecord:
        existing = self.get_metadata(image_id=image_id, user_id=user_id)
        if existing:
            return self.update_metadata(metadata_id=existing.id, payload=payload)
        create_payload: MetadataCreatePayload = {
            "image_id": image_id,
            "user_id": user_id,
            **payload,
        }
        return self.create_metadata(create_payload)

    def update_image(
        self,
        image_id: int,
        user_id: str,
        payload: ImageUpdatePayload,
    ) -> ImageRecord:
        rows = self._execute_typed_rows(
            self._client.table("images")
            .update(payload)
            .eq("id", image_id)
            .eq("user_id", user_id),
            model=ImageRecord,
            context=f"updating image {image_id}",
        )
        if not rows:
            raise SupabaseError(f"Image row {image_id} was not updated.")
        return rows[0]

    def download_bytes(self, object_path: str) -> tuple[bytes, str]:
        cleaned_path = self._clean_path(object_path)
        try:
            payload = self._client.storage.from_(self._bucket).download(cleaned_path)
        except Exception as exc:  # noqa: BLE001
            raise SupabaseError(
                f"Supabase operation failed while downloading storage object {cleaned_path}: {exc}"
            ) from exc
        content_type = mimetypes.guess_type(cleaned_path)[0] or "application/octet-stream"
        return self._to_bytes(payload), content_type

    def upload_object(
        self,
        object_path: str,
        payload: bytes,
        *,
        content_type: str,
        upsert: bool = True,
    ) -> None:
        cleaned_path = self._clean_path(object_path)
        file_options = {
            "content-type": content_type,
            "upsert": "true" if upsert else "false",
        }
        try:
            self._client.storage.from_(self._bucket).upload(
                cleaned_path,
                payload,
                file_options,
            )
        except Exception as exc:  # noqa: BLE001
            raise SupabaseError(
                f"Supabase operation failed while uploading storage object {cleaned_path}: {exc}"
            ) from exc

    def create_signed_url(
        self,
        object_path: str,
        *,
        expires_in: int = 60,
        download: bool = True,
    ) -> str:
        cleaned_path = self._clean_path(object_path)
        try:
            response = self._client.storage.from_(self._bucket).create_signed_url(
                cleaned_path,
                expires_in,
                {"download": download},
            )
        except Exception as exc:  # noqa: BLE001
            raise SupabaseError(
                f"Supabase operation failed while creating signed URL for {cleaned_path}: {exc}"
            ) from exc
        signed_url: str | None = None
        if isinstance(response, dict):
            signed_url = (
                response.get("signedURL")
                or response.get("signedUrl")
                or response.get("signed_url")
                or response.get("url")
            )
        elif hasattr(response, "data") and isinstance(response.data, dict):
            signed_url = (
                response.data.get("signedURL")
                or response.data.get("signedUrl")
                or response.data.get("signed_url")
                or response.data.get("url")
            )

        if not signed_url:
            raise SupabaseError(
                f"Supabase did not return a signed URL for storage object {cleaned_path}."
            )
        if signed_url.startswith("/"):
            return f"{self._base_url}{signed_url}"
        return signed_url


@lru_cache
def get_supabase_service() -> SupabaseService:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set.")
    return SupabaseService(
        base_url=settings.supabase_url,
        secret_key=settings.supabase_secret_key,
        bucket=settings.supabase_storage_bucket,
    )
