from pydantic import BaseModel, Field


class ImageAnalysis(BaseModel):
    tags: list[str] = Field(default_factory=list)
    description: str


class ProcessImageRequest(BaseModel):
    image_id: int

class ProcessImageResponse(BaseModel):
    message: str
