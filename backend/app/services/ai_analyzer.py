import json
import re
from functools import lru_cache

from openai import AsyncOpenAI

from app.config import get_settings
from app.models.schemas import ImageAnalysis


class AnalyzerError(Exception):
    """Raised when AI analysis fails."""


class OpenAIImageAnalyzer:
    def __init__(self, api_key: str, model: str) -> None:
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    async def analyze(self, image_url: str) -> ImageAnalysis:
        prompt = (
            "Analyze this image and return only valid JSON with this exact schema: "
            '{"tags": ["tag-one", "tag-two"], "description": "One-sentence description."}. '
            "Rules: 3-8 concise lowercase tags, no hashtags, no punctuation in tags, "
            "description max 25 words."
        )

        try:
            response = await self._client.responses.create(
                model=self._model,
                temperature=0.2,
                max_output_tokens=200,
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
            print(exc)
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

        return ImageAnalysis(tags=deduped_tags[:8], description=description.strip())


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
    return OpenAIImageAnalyzer(api_key=settings.openai_api_key, model=settings.openai_model)
