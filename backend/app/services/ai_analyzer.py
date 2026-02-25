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


class OpenAIImageAnalyzer:
    def __init__(self, api_key: str, model: str, timeout_seconds: int) -> None:
        self._client = AsyncOpenAI(
            api_key=api_key,
            timeout=float(timeout_seconds),
            max_retries=1,
        )
        self._model = model

    async def analyze(self, image_url: str) -> ImageAnalysis:
        prompt = (
            "Analyze this image and return only valid JSON with this exact schema: "
            '{"tags": ["tag-one", "tag-two"], "description": "One-sentence description."}. '
            'Rules: 5-10 concise lowercase tags, include both specific and general tags where relevant (e.g. both "golden retriever" and "dog"), no hashtags, no punctuation in tags, '
            "description max 25 words."
        )

        try:
            response = await self._client.responses.create(
                model=self._model,
                temperature=0.2,
                max_output_tokens=300,
                input=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": prompt},
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
        output_text = (response.output_text or "").strip()
        if not output_text:
            raise AnalyzerError("OpenAI returned an empty response.")

        try:
            parsed = _parse_json_output(output_text)
        except json.JSONDecodeError as exc:
            raise AnalyzerError("OpenAI returned non-JSON output.") from exc

        if not isinstance(parsed, dict):
            raise AnalyzerError("OpenAI response was not a JSON object.")

        tags = parsed.get("tags", [])
        description = parsed.get("description", "")

        if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
            raise AnalyzerError("Invalid tags in OpenAI response.")
        if not isinstance(description, str) or not description.strip():
            raise AnalyzerError("Invalid description in OpenAI response.")

        clean_tags = [tag.strip().lower() for tag in tags if tag.strip()]
        deduped_tags = list(dict.fromkeys(clean_tags))

        return ImageAnalysis(tags=deduped_tags[:10], description=description.strip())


def _parse_json_output(text: str) -> dict:
    normalized = text.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", normalized, flags=re.DOTALL)
    if fenced:
        normalized = fenced.group(1).strip()
    return json.loads(normalized)


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
