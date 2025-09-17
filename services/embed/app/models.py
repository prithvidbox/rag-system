from typing import List

from pydantic import BaseModel, Field


class EmbeddingRequest(BaseModel):
    texts: List[str] = Field(..., description="Texts to embed")
    model: str = Field(..., description="Embedding model identifier")


class EmbeddingResponse(BaseModel):
    embeddings: List[List[float]]
    model: str
