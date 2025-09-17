from fastapi import FastAPI, HTTPException, status

from openai import AsyncOpenAI

from rag_shared import Settings, configure_logging, get_settings

from .models import EmbeddingRequest, EmbeddingResponse

app = FastAPI(title="Embedding Service", version="0.1.0")
settings: Settings = get_settings()
configure_logging("embed")


@app.get("/system/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/v1/embed", response_model=EmbeddingResponse)
async def create_embeddings(payload: EmbeddingRequest) -> EmbeddingResponse:
    if not settings.openai_api_key:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OpenAI API key not configured")

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.embeddings.create(model=payload.model, input=payload.texts)
    vectors = [item.embedding for item in response.data]
    return EmbeddingResponse(embeddings=vectors, model=payload.model)
