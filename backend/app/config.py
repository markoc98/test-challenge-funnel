from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="AI Image Service", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")

    supabase_url: str | None = Field(default=None, alias="SUPABASE_URL")
    supabase_secret_key: str | None = Field(default=None, alias="SUPABASE_SECRET_KEY")
    supabase_storage_bucket: str = Field(default="gallery", alias="SUPABASE_STORAGE_BUCKET")

    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    openai_timeout_seconds: int = Field(default=45, alias="OPENAI_TIMEOUT_SECONDS", ge=5, le=300)

    google_api_key: str | None = Field(default=None, alias="GOOGLE_API_KEY")
    google_model: str = Field(default="gemini-2.5-flash", alias="GOOGLE_MODEL")

    supabase_postgrest_timeout_seconds: int = Field(
        default=30,
        alias="SUPABASE_POSTGREST_TIMEOUT_SECONDS",
        ge=5,
        le=300,
    )
    supabase_storage_timeout_seconds: int = Field(
        default=30,
        alias="SUPABASE_STORAGE_TIMEOUT_SECONDS",
        ge=5,
        le=300,
    )

    max_upload_size_mb: int = Field(default=10, alias="MAX_UPLOAD_SIZE_MB")
    thumbnail_size: int = Field(default=300, alias="THUMBNAIL_SIZE")
    cors_origins: str = Field(default="http://localhost:5173", alias="CORS_ORIGINS")
    similarity_top_k: int = Field(default=10, alias="SIMILARITY_TOP_K", ge=1, le=50)
    similarity_match_threshold: float = Field(
        default=0.45,
        alias="SIMILARITY_MATCH_THRESHOLD",
        ge=0.0,
        le=1.0,
    )
    color_match_threshold: float = Field(
        default=0.75,
        alias="COLOR_MATCH_THRESHOLD",
        ge=0.0,
        le=1.0,
    )
    color_search_top_k: int = Field(default=100, alias="COLOR_SEARCH_TOP_K", ge=1, le=500)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
