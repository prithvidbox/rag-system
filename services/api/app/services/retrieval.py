from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

from rag_shared import DocumentChunk


async def retrieve_documents(
    client,
    index_name: str,
    query: str,
    top_k: int,
    filters: Optional[Dict[str, Any]] = None,
    principals: Optional[List[str]] = None,
) -> List[DocumentChunk]:
    """Query Weavnet for similar documents."""

    def _query() -> List[DocumentChunk]:
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
            .with_near_text({"concepts": [query]})
            .with_limit(top_k)
            .with_additional(["score", "distance"])
        )
        if where_filter:
            chain = chain.with_where(where_filter)
        response = chain.do()
        data = response.get("data", {}).get("Get", {}).get(index_name, [])
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
                    score=additional.get("score"),
                )
            )
        return chunks

    return await asyncio.to_thread(_query)
