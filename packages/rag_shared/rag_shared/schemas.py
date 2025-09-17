"""Shared Pydantic schemas."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class DocumentChunk(BaseModel):
    """Chunked document stored in vector index."""

    id: str
    text: str
    source: str
    document_id: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    allowed_principals: List[str] = Field(default_factory=list)
    score: Optional[float] = None


class RetrievalResult(BaseModel):
    """A single retrieval result returned to clients."""

    query: str
    answer: str
    citations: List[DocumentChunk]
    created_at: datetime = Field(default_factory=datetime.utcnow)
