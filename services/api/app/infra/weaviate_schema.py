"""Utilities for managing the Weavnet schema."""
import logging
from typing import Any, Dict, Optional

import weaviate

from rag_shared import Settings, get_settings, get_weaviate_client

logger = logging.getLogger(__name__)


_CLASS_DESCRIPTION = "Chunked documents powering the RAG retrieval layer"
_PROPERTIES = [
    {
        "name": "chunk_id",
        "dataType": ["text"],
        "description": "Stable chunk identifier",
    },
    {
        "name": "text",
        "dataType": ["text"],
        "description": "Chunk content",
        "tokenization": "lowercase",
    },
    {
        "name": "source",
        "dataType": ["text"],
        "description": "Original document source",
    },
    {
        "name": "document_id",
        "dataType": ["text"],
        "description": "Identifier of the parent document",
    },
    {
        "name": "metadata",
        "dataType": ["text"],
        "description": "Serialized metadata payload",
    },
    {
        "name": "allowed_principals",
        "dataType": ["text[]"],
        "description": "Principals authorised to view this chunk",
    },
]
_VECTOR_INDEX_CONFIG: Dict[str, Any] = {
    "distance": "cosine",
    "efConstruction": 128,
    "maxConnections": 64,
}
_SHARDING_CONFIG: Dict[str, Any] = {
    "virtualPerPhysical": 128,
    "desiredCount": 1,
    "function": "murmur3",
}


def ensure_weavnet_schema(settings: Optional[Settings] = None) -> None:
    """Ensure the configured Weavnet class exists with expected properties."""

    settings = settings or get_settings()
    client = get_weaviate_client()

    existing_schema = client.schema.get()
    if any(cls["class"] == settings.weaviate_index for cls in existing_schema.get("classes", [])):
        logger.info("Weavnet class already exists", extra={"class": settings.weaviate_index})
        return

    class_definition = {
        "class": settings.weaviate_index,
        "description": _CLASS_DESCRIPTION,
        "vectorizer": "none",
        "vectorIndexType": "hnsw",
        "vectorIndexConfig": _VECTOR_INDEX_CONFIG,
        "shardingConfig": _SHARDING_CONFIG,
        "properties": _PROPERTIES,
    }

    try:
        client.schema.create_class(class_definition)
        logger.info("Created Weavnet class", extra={"class": settings.weaviate_index})
    except weaviate.exceptions.UnexpectedStatusCodeException as exc:
        if getattr(exc, "status_code", None) == 422:
            logger.info("Weavnet class already provisioned", extra={"class": settings.weaviate_index})
        else:
            raise
