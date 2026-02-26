from pydantic import BaseModel, Field, field_validator


class ImageAnalysis(BaseModel):
    tags: list[str] = Field(default_factory=list)
    description: str


class ProcessImageRequest(BaseModel):
    image_id: int


class ProcessImageResponse(BaseModel):
    message: str


class SimilarImagesRequest(BaseModel):
    image_id: int
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)


class SimilarImageQueryMetadata(BaseModel):
    image_id: int
    tags: list[str] = Field(default_factory=list)
    colors: list[str] = Field(default_factory=list)
    description: str = ""


class SimilarImageScoreBreakdown(BaseModel):
    cosine: float
    rare_tag_boost: float
    rare_tags: list[str] = Field(default_factory=list)


class SimilarImageMatch(BaseModel):
    image_id: int
    filename: str | None = None
    original_path: str | None = None
    thumbnail_path: str | None = None
    score: float
    is_match: bool
    tags: list[str] = Field(default_factory=list)
    colors: list[str] = Field(default_factory=list)
    description: str = ""
    score_breakdown: SimilarImageScoreBreakdown


class SimilarImagesResponse(BaseModel):
    query: SimilarImageQueryMetadata
    match_threshold: float
    page: int
    limit: int
    total_count: int
    total_pages: int
    matches: list[SimilarImageMatch] = Field(default_factory=list)


class ColorSearchRequest(BaseModel):
    color_hex: str = Field(min_length=7, max_length=7)
    threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)

    @field_validator("color_hex")
    @classmethod
    def validate_color_hex(cls, value: str) -> str:
        normalized = value.strip().upper()
        if len(normalized) != 7 or not normalized.startswith("#"):
            raise ValueError("color_hex must be in #RRGGBB format.")
        hex_part = normalized[1:]
        if any(char not in "0123456789ABCDEF" for char in hex_part):
            raise ValueError("color_hex must be in #RRGGBB format.")
        return normalized


class ColorSearchMatch(BaseModel):
    image_id: int
    filename: str | None = None
    original_path: str | None = None
    thumbnail_path: str | None = None
    score: float
    tags: list[str] = Field(default_factory=list)
    colors: list[str] = Field(default_factory=list)
    description: str = ""


class ColorSearchResponse(BaseModel):
    query_color: str
    match_threshold: float
    page: int
    limit: int
    total_count: int
    total_pages: int
    matches: list[ColorSearchMatch] = Field(default_factory=list)
