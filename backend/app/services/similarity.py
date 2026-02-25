from __future__ import annotations

import math
import re
from dataclasses import dataclass
from functools import lru_cache

from app.models.db import ImageMetadataRecord

class SimilarityError(Exception):
    """Raised when similarity scoring cannot be computed."""


@dataclass(frozen=True)
class SimilarityCandidate:
    image_id: int
    tags: list[str]
    colors: list[str]
    description: str


@dataclass(frozen=True)
class SimilarityScore:
    image_id: int
    score: float
    cosine: float
    rare_tag_boost: float
    rare_tags: list[str]
    tags: list[str]
    colors: list[str]
    description: str


class SimilarityService:
    def __init__(
        self,
        *,
        tag_weight: float = 1.0,
        rare_tag_max_doc_ratio: float = 0.25,
        rare_tag_boost_per_tag: float = 0.10,
        rare_tag_boost_cap: float = 0.30,
    ) -> None:
        self._tag_weight = tag_weight
        self._rare_tag_max_doc_ratio = rare_tag_max_doc_ratio
        self._rare_tag_boost_per_tag = rare_tag_boost_per_tag
        self._rare_tag_boost_cap = rare_tag_boost_cap

    @staticmethod
    @lru_cache(maxsize=512)
    def _hex_to_hsl(hex_color: str) -> tuple[float, float, float] | None:
        if not isinstance(hex_color, str):
            return None
        value = hex_color.strip().lower()
        if not re.fullmatch(r"#[0-9a-f]{6}", value):
            return None

        r = int(value[1:3], 16) / 255.0
        g = int(value[3:5], 16) / 255.0
        b = int(value[5:7], 16) / 255.0

        c_max = max(r, g, b)
        c_min = min(r, g, b)
        delta = c_max - c_min

        l = (c_max + c_min) / 2.0
        if delta == 0.0:
            return 0.0, 0.0, l

        s = delta / (1.0 - abs(2.0 * l - 1.0))
        if c_max == r:
            h = ((g - b) / delta) % 6.0
        elif c_max == g:
            h = ((b - r) / delta) + 2.0
        else:
            h = ((r - g) / delta) + 4.0

        return h / 6.0, s, l

    @staticmethod
    def _hsl_distance(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
        # Hue is circular, so wrap to the shorter arc before measuring distance.
        hue_delta = abs(a[0] - b[0])
        hue_delta = min(hue_delta, 1.0 - hue_delta)
        sat_delta = a[1] - b[1]
        light_delta = a[2] - b[2]
        return math.sqrt((hue_delta * hue_delta) + (sat_delta * sat_delta) + (light_delta * light_delta))

    def _color_similarity(self, query_colors: list[str], candidate_colors: list[str]) -> float:
        query_hsl = [hsl for hsl in (self._hex_to_hsl(c) for c in query_colors) if hsl is not None]
        candidate_hsl = [hsl for hsl in (self._hex_to_hsl(c) for c in candidate_colors) if hsl is not None]
        if not query_hsl or not candidate_hsl:
            return 0.0

        max_distance = math.sqrt((0.5 * 0.5) + 1.0 + 1.0)
        # Nearest-neighbor matching: each query color contributes based on its closest candidate color.
        per_color_similarities = []
        for q_color in query_hsl:
            nearest_distance = min(self._hsl_distance(q_color, c_color) for c_color in candidate_hsl)
            per_color_similarities.append(1.0 - (nearest_distance / max_distance))

        avg_similarity = sum(per_color_similarities) / len(per_color_similarities)
        return max(0.0, min(1.0, avg_similarity))

    @staticmethod
    def _normalize_tag(tag: str) -> str:
        normalized = tag.strip().lower().replace("-", " ")
        return re.sub(r"\s+", " ", normalized)

    @staticmethod
    def _cosine_sparse(a: dict[int, float], b: dict[int, float]) -> float:
        if not a or not b:
            return 0.0

        dot = 0.0
        if len(a) < len(b):
            for idx, val in a.items():
                dot += val * b.get(idx, 0.0)
        else:
            for idx, val in b.items():
                dot += val * a.get(idx, 0.0)

        norm_a = math.sqrt(sum(v * v for v in a.values()))
        norm_b = math.sqrt(sum(v * v for v in b.values()))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    def _build_vocab(self, candidates: list[SimilarityCandidate]) -> dict[str, int]:
        vocab: dict[str, int] = {}
        for candidate in candidates:
            for tag in {self._normalize_tag(t) for t in candidate.tags if self._normalize_tag(t)}:
                token = f"tag:{tag}"
                if token not in vocab:
                    vocab[token] = len(vocab)
        return vocab

    def _build_tag_df(self, candidates: list[SimilarityCandidate]) -> dict[str, int]:
        df: dict[str, int] = {}
        for candidate in candidates:
            unique_tags = {self._normalize_tag(t) for t in candidate.tags if self._normalize_tag(t)}
            for tag in unique_tags:
                df[tag] = df.get(tag, 0) + 1
        return df

    @staticmethod
    def _build_tag_idf(tag_df: dict[str, int], total_docs: int) -> dict[str, float]:
        # Dev note: smoothed IDF avoids division-by-zero and keeps singletons meaningfully stronger.
        return {
            tag: math.log((total_docs + 1.0) / (df + 1.0)) + 1.0
            for tag, df in tag_df.items()
        }

    def _to_vector(
        self,
        candidate: SimilarityCandidate,
        *,
        vocab: dict[str, int],
        tag_idf: dict[str, float],
    ) -> dict[int, float]:
        vector: dict[int, float] = {}
        unique_tags = {
            self._normalize_tag(tag)
            for tag in candidate.tags
            if self._normalize_tag(tag)
        }
        for tag in unique_tags:
            idx = vocab.get(f"tag:{tag}")
            if idx is None:
                continue
            vector[idx] = vector.get(idx, 0.0) + (self._tag_weight * tag_idf.get(tag, 1.0))
        return vector

    def from_metadata_rows(self, rows: list[ImageMetadataRecord]) -> list[SimilarityCandidate]:
        by_image_id: dict[int, SimilarityCandidate] = {}
        for row in rows:
            if row.image_id is None:
                continue
            tags = [tag for tag in (row.tags or []) if isinstance(tag, str)]
            colors = [color for color in (row.colors or []) if isinstance(color, str)]
            description = row.description if isinstance(row.description, str) else ""
            by_image_id[row.image_id] = SimilarityCandidate(
                image_id=row.image_id,
                tags=tags,
                colors=colors,
                description=description,
            )
        return list(by_image_id.values())

    def rank_similar(
        self,
        *,
        query_image_id: int,
        candidates: list[SimilarityCandidate],
        top_k: int = 10,
    ) -> tuple[SimilarityCandidate, list[SimilarityScore]]:
        by_id = {candidate.image_id: candidate for candidate in candidates}
        query = by_id.get(query_image_id)
        if not query:
            raise SimilarityError(
                f"Query image_id={query_image_id} was not found in completed metadata rows."
            )

        all_candidates = [query, *[c for c in candidates if c.image_id != query_image_id]]
        if len(all_candidates) <= 1:
            return query, []

        vocab = self._build_vocab(all_candidates)
        tag_df = self._build_tag_df(all_candidates)
        total_docs = max(len(all_candidates), 1)
        tag_idf = self._build_tag_idf(tag_df, total_docs)

        query_tags = {
            self._normalize_tag(tag)
            for tag in query.tags
            if self._normalize_tag(tag)
        }
        query_vec = self._to_vector(query, vocab=vocab, tag_idf=tag_idf)

        scored: list[SimilarityScore] = []
        for candidate in all_candidates:
            if candidate.image_id == query.image_id:
                continue

            candidate_vec = self._to_vector(candidate, vocab=vocab, tag_idf=tag_idf)
            cosine = self._cosine_sparse(query_vec, candidate_vec)

            candidate_tags = {
                self._normalize_tag(tag)
                for tag in candidate.tags
                if self._normalize_tag(tag)
            }
            shared_tags = query_tags & candidate_tags
            rare_tags = sorted(
                tag
                for tag in shared_tags
                if (tag_df.get(tag, total_docs) / total_docs) <= self._rare_tag_max_doc_ratio
            )
            rare_boost = min(self._rare_tag_boost_cap, self._rare_tag_boost_per_tag * len(rare_tags))
            tag_score = max(0.0, min(1.0, cosine + rare_boost))
            color_score = self._color_similarity(query.colors, candidate.colors)
            score = (0.7 * tag_score) + (0.3 * color_score)

            scored.append(
                SimilarityScore(
                    image_id=candidate.image_id,
                    score=score,
                    cosine=cosine,
                    rare_tag_boost=rare_boost,
                    rare_tags=rare_tags,
                    tags=candidate.tags,
                    colors=candidate.colors,
                    description=candidate.description,
                )
            )

        scored.sort(key=lambda row: (row.score, row.cosine), reverse=True)
        return query, scored[:top_k]


@lru_cache
def get_similarity_service() -> SimilarityService:
    return SimilarityService()
