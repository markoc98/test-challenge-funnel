## Overview

This document covers the research, testing, and reasoning behind the AI service selected for image tagging and description generation in the AI Image Gallery project.

Required AI capabilities:
- Generate 5-10 relevant tags per image
- Create one descriptive sentence about the image
- Process images asynchronously in the background
- Support JPEG/PNG input via API
- Cost-effective for prototyping and evaluation

Color extraction is handled separately by a custom Pillow-based extractor (k-means quantization), so LLM usage is focused only on tasks that benefit from language understanding.

---

## Research Process

Three services were evaluated hands-on: **GPT-4o-mini** (OpenAI Vision API), **Gemini 2.0 Flash** (Google AI Studio), and **Google Cloud Vision API**. Each was assessed on structured output reliability, tag and description quality on general photography, cost per image, ease of integration with FastAPI/Python, and suitability for async background processing.

---

## Benchmark Reference

MMBench_V11 was used as the primary benchmark reference for quality comparison. MMBench is a holistic benchmark for vision-language models covering 20 ability dimensions including object recognition, attribute identification, and spatial reasoning. Unlike narrower academic benchmarks such as MathVista or AI2D which focus on mathematical and diagram reasoning, MMBench targets broad real-world visual perception, making it a reasonable proxy for a photo tagging use case.

![GPT-4o-mini MMBench Overall](./docs/4o-mini-MMBench.png)
![GPT-4o-mini MMBench Categorized](./docs/4o-mini-MMBench-categorized.png)

![Gemini 2.0 Flash MMBench Overall](./docs/gemini-2-MMBench.png)
![Gemini 2.0 Flash MMBench Categorized](./docs/gemini-2-MMBench-categorized.png)

On MMBench_V11, **GPT-4o-mini scores 76** vs **Gemini 2.0 Flash at 71**.

For broader context: Gemini 2.0 Flash leads on the average across all 8 VLM benchmarks included in the leaderboard (66.1 vs 59.0), but that average includes task categories like mathematical reasoning and OCR that have no bearing on photo tagging. On the benchmark most relevant to this use case, GPT-4o-mini performs better.

---

## Comparison of Options

| Service | Tags (5-10) | Description | Est. Cost/Image | Tested | Integration |
|---|---|---|---|---|---|
| **GPT-4o-mini** ✅ | Excellent, prompt-controlled | Accurate, concise | ~$0.002-0.005 | Yes | OpenAI Python SDK, native structured output |
| Gemini 2.0 Flash | Strong | Good | ~$0.002-0.004 | Yes | Google AI SDK, weaker structured output, 5 RPM free tier limit |
| Google Cloud Vision | Native labels only | No native description | ~$0.0015 | Setup attempted | Excellent SDK, missing description capability |

**Cost notes:** GPT-4o-mini uses 2833 tokens per image in low-resolution mode at $0.15/$0.60 per million input/output tokens. Processing 100 images costs approximately $0.05-0.10. Gemini 2.0 Flash is marginally cheaper at $0.10/$0.40 per million tokens, but the difference is sub-cent at this scale.

---

## Google Cloud Vision: Why It Was Ruled Out

Google Cloud Vision was the first alternative explored. Setup via the Google Cloud Console was straightforward, but the API returns a fixed vocabulary of confidence-ranked labels with no mechanism for generating natural language descriptions. Satisfying the challenge requirement of "one descriptive sentence per image" would require a second LLM call to convert labels into a sentence, adding latency and complexity with no quality benefit over using a multimodal LLM from the start.

---

## Gemini 2.0 Flash: Why It Was Not Selected

Gemini 2.0 Flash was tested end-to-end in the application. Tag and description quality was comparable to GPT-4o-mini on everyday photography. However, three practical issues came up during testing:

**Rate limiting on free tier.** The Google AI Studio free tier is capped at 5 requests per minute. With batch uploads of up to 10 images at a time, this made testing slow and painful. Each batch would saturate the limit immediately, requiring manual waits between test runs. OpenAI free credits have no per-minute cap at this scale.

**Structured output reliability.** Enforcing a strict JSON schema with Gemini required defensive parsing. The model occasionally wrapped output in markdown fences or deviated from the schema despite clear instructions in the prompt. OpenAI Structured Outputs enforces the schema at the token level, so the output is always valid JSON matching the schema exactly. This allowed removing all defensive parsing code from the implementation.

**SDK maturity.** The OpenAI Python SDK is more straightforward to integrate with FastAPI async patterns and has better documented examples for this type of use case.

Gemini 2.0 Flash would be a reasonable fallback if OpenAI pricing became a concern at scale, and its free tier is useful for development once the RPM limitation is understood.

---

## Selected Service: GPT-4o-mini

### Prompt Design

The final prompt used for analysis:

```
Analyze this image. "
"Return 5-10 concise lowercase tags — include both specific and general tags where relevant "
'(e.g. both "golden retriever" and "dog"). No hashtags, no punctuation in tags. '
"Description must be one sentence, max 25 words, starting with a capital letter.n.
```

Combined with OpenAI Structured Outputs (JSON schema enforcement), this produces consistent results:

```json
{
  "tags": ["golden retriever", "dog", "puppy", "grass", "outdoor", "sunny", "playful"],
  "description": "A golden retriever puppy playing in a sunny backyard garden."
}
```

### Generation Settings

| Parameter | Value | Rationale |
|---|---|---|
| Model | gpt-4o-mini | Best cost/quality ratio for structured vision tasks |
| Temperature | 0.2 | Low for consistent, deterministic output |
| Max output tokens | 300 | Sufficient for 10 tags plus a 25-word description |
| Structured output | JSON schema enforced | Guarantees valid schema, no defensive parsing needed |

### Why GPT-4o-mini

- **Benchmark performance:** leads Gemini 2.0 Flash on MMBench_V11 (76 vs 71), the most relevant benchmark for this use case
- **Native structured output:** schema enforced at token level, not prompt level, eliminating JSON parsing failures
- **Tag quality:** in testing, reliably produced both specific and general tags (e.g. "golden retriever" and "dog") from a single general prompt
- **Integration:** AsyncOpenAI client works cleanly with FastAPI background tasks with minimal boilerplate
- **No rate limit friction:** OpenAI free credits allowed full batch upload testing without hitting per-minute caps
- **Error handling:** the SDK exposes typed retryable errors, enabling graceful retry on transient signed URL failures

### Cost Awareness

At 2833 input tokens per image (low-res mode) plus approximately 150 output tokens:

| Volume | Estimated Cost |
|---|---|
| 50 images (demo) | ~$0.03 |
| 1,000 images | ~$0.55 |
| 10,000 images | ~$5.50 |

At production scale, the OpenAI Batch API reduces costs by 50% for non-real-time processing, which is documented as a potential improvement in the project README.

---

## Summary

GPT-4o-mini was selected based on benchmark performance on the most relevant task, native structured output enforcement, clean SDK integration, and no rate limit friction during testing. Gemini 2.0 Flash is technically comparable but the 5 RPM free tier cap and weaker JSON schema compliance made it harder to work with during development. Google Cloud Vision does not meet the description generation requirement without significant additional complexity.