from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

import logging
import requests

from rag_shared import DocumentChunk, Settings

logger = logging.getLogger(__name__)


async def retrieve_documents(
    client,
    index_name: str,
    query: str,
    top_k: int,
    *,
    settings: Settings,
    filters: Optional[Dict[str, Any]] = None,
    principals: Optional[List[str]] = None,
) -> List[DocumentChunk]:
    """Query Weavnet for similar documents."""

    def _query() -> List[DocumentChunk]:
        vector: Optional[List[float]] = None
        try:
            payload = {"texts": [query], "model": settings.embedding_model}
            response = requests.post(
                f"{settings.embedding_service_url}/v1/embed",
                json=payload,
                timeout=30,
            )
            response.raise_for_status()
            embeddings = response.json().get("embeddings", [])
            if embeddings:
                vector = embeddings[0]
        except Exception as exc:  # pragma: no cover - external service variability
            logger.warning("failed to embed query", extra={"error": str(exc)})

        where_filter = filters.copy() if filters else None
        if principals:
            principal_filter = {
                "path": ["allowed_principals"],
                "operator": "ContainsAny",
                "valueTextArray": principals,
            }
            if where_filter:
                where_filter = {
                    "operator": "And",
                    "operands": [where_filter, principal_filter],
                }
            else:
                where_filter = principal_filter
        chain = (
            client
            .query
            .get(index_name, ["chunk_id", "text", "source", "metadata", "document_id", "allowed_principals"])
            .with_limit(top_k)
            .with_additional(["distance", "id", "certainty"])
        )
        if vector is not None:
            chain = chain.with_near_vector({"vector": vector})
        else:
            chain = chain.with_near_text({"concepts": [query]})
            logger.debug("falling back to near_text search")

        if where_filter:
            chain = chain.with_where(where_filter)
        response = chain.do()
        logger.debug("weaviate response", extra={"raw": response})

        result_container = response.get("data", {}).get("Get", {})
        data = result_container.get(index_name)
        if data is None:
            for key, value in result_container.items():
                if key.lower() == index_name.lower():
                    data = value
                    break
        if data is None:
            data = []
        chunks: List[DocumentChunk] = []
        for item in data:
            additional = item.get("_additional", {})
            metadata_raw = item.get("metadata")
            metadata: Dict[str, Any]
            if isinstance(metadata_raw, str):
                try:
                    metadata = json.loads(metadata_raw)
                except json.JSONDecodeError:
                    metadata = {"raw": metadata_raw}
            else:
                metadata = metadata_raw or {}

            chunks.append(
                DocumentChunk(
                    id=item.get("chunk_id") or additional.get("id") or additional.get("uuid"),
                    text=item.get("text", ""),
                    source=item.get("source", "unknown"),
                    document_id=item.get("document_id"),
                    metadata=metadata,
                    allowed_principals=item.get("allowed_principals", []) or [],
                    score=_resolve_score(additional),
                )
            )
        return chunks

    chunks = await asyncio.to_thread(_query)
    logger.info(
        "retrieval results",
        extra={"count": len(chunks), "top_k": top_k},
    )
    return chunks


def _resolve_score(additional: Dict[str, Any]) -> Optional[float]:
    score = additional.get("certainty") or additional.get("score")
    if score is not None:
        try:
            return float(score)
        except (TypeError, ValueError):  # pragma: no cover - defensive
            return None

    distance = additional.get("distance")
    if distance is None:
        return None
    try:
        return 1.0 - float(distance)
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return None
