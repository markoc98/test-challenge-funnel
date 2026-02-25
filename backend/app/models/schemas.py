from pydantic import BaseModel, Field


class ImageAnalysis(BaseModel):
    tags: list[str] = Field(default_factory=list)
    description: str


class ProcessImageRequest(BaseModel):
    image_id: int


class ProcessImageResponse(BaseModel):
    message: str


class SimilarImagesRequest(BaseModel):
    image_id: int


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
    matches: list[SimilarImageMatch] = Field(default_factory=list)
