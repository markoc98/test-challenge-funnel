import json
import re
from functools import lru_cache

from openai import AsyncOpenAI

from app.config import get_settings
from app.models.schemas import ImageAnalysis


class AnalyzerError(Exception):
    """Raised when AI analysis fails."""

    def __init__(self, message: str, *, retryable_url_error: bool = False) -> None:
        super().__init__(message)
        self.retryable_url_error = retryable_url_error


def _is_retryable_url_download_error(error_text: str) -> bool:
    normalized = error_text.lower()
    has_url_param = (
        "param': 'url'" in normalized
        or '"param": "url"' in normalized
        or "param=url" in normalized
    )
    return "error while downloading" in normalized and (
        has_url_param or "invalid_value" in normalized
    )


_ANALYSIS_SCHEMA = {
    "type": "json_schema",
    "name": "image_analysis",
    "schema": {
        "type": "object",
        "properties": {
            "tags": {
                "type": "array",
                "items": {"type": "string"},
            },
            "description": {"type": "string"},
        },
        "required": ["tags", "description"],
        "additionalProperties": False,
    },
    "strict": True,
}

_PROMPT = (
    "Analyze this image. "
    "Return 5-10 concise lowercase tags — include both specific and general tags where relevant "
    '(e.g. both "golden retriever" and "dog"). No hashtags, no punctuation in tags. '
    "Description must be one sentence, max 25 words, starting with a capital letter."
)


class OpenAIImageAnalyzer:
    def __init__(self, api_key: str, model: str, timeout_seconds: int) -> None:
        self._client = AsyncOpenAI(
            api_key=api_key,
            timeout=float(timeout_seconds),
            max_retries=1,
        )
        self._model = model

    async def analyze(self, image_url: str) -> ImageAnalysis:
        try:
            response = await self._client.responses.create(
                model=self._model,
                temperature=0.2,
                max_output_tokens=300,
                text={"format": _ANALYSIS_SCHEMA},
                input=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": _PROMPT},
                            {"type": "input_image", "image_url": image_url},
                        ],
                    }
                ],
            )
        except Exception as exc:  # noqa: BLE001
            if _is_retryable_url_download_error(str(exc)):
                raise AnalyzerError(
                    "OpenAI could not download the provided image URL.",
                    retryable_url_error=True,
                ) from exc
            raise AnalyzerError("OpenAI request failed.") from exc

        parsed = json.loads(response.output_text)
        tags = parsed["tags"]
        description = parsed["description"]

        # Semantic validation — schema guarantees structure, not content quality
        if not description.strip():
            raise AnalyzerError("OpenAI returned an empty description.")

        clean_tags = [tag.strip().lower() for tag in tags if tag.strip()]
        deduped_tags = list(dict.fromkeys(clean_tags))
        return ImageAnalysis(tags=deduped_tags[:10], description=description.strip())


@lru_cache
def get_image_analyzer() -> OpenAIImageAnalyzer:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    return OpenAIImageAnalyzer(
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        timeout_seconds=settings.openai_timeout_seconds,
    )
