import time

from fastapi import APIRouter, Depends, HTTPException, status

from rag_shared import Settings

from ..dependencies import get_settings_dep, get_weaviate_dep
from ..models import ChatQuery, ChatResponse, SourceDocument
from ..services.generation import generate_answer
from ..services.memory import build_memory_transcript
from ..services.persistence import record_chat_interaction
from ..services.retrieval import retrieve_documents

router = APIRouter(prefix="/v1/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(query: ChatQuery, settings: Settings = Depends(get_settings_dep), client=Depends(get_weaviate_dep)):
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="LLM provider not configured",
        )

    principals = list(query.principals)
    if settings.enable_permission_filters:
        if not principals:
            principals = [settings.default_public_principal]

    history = await build_memory_transcript(
        conversation_id=query.conversation_id,
        settings=settings,
    )

    start = time.perf_counter()
    chunks = await retrieve_documents(
        client=client,
        index_name=settings.weaviate_index,
        query=query.query,
        top_k=query.top_k,
        principals=principals,
    )
    answer = await generate_answer(
        settings=settings,
        query=query.query,
        chunks=chunks,
        history=history,
    )
    latency_ms = int((time.perf_counter() - start) * 1000)

    sources = [
        SourceDocument(
            id=chunk.id,
            text=chunk.text,
            source=chunk.source,
            score=chunk.score,
            metadata=chunk.metadata,
        )
        for chunk in chunks
    ]

    conversation_id, message_id = await record_chat_interaction(
        conversation_id=query.conversation_id,
        query=query.query,
        answer=answer,
        sources=[source.model_dump() for source in sources],
        latency_ms=latency_ms,
        user_id=query.user_id,
        principals=principals,
    )
    return ChatResponse(
        query=query.query,
        answer=answer,
        sources=sources,
        conversation_id=conversation_id,
        message_id=message_id,
    )
