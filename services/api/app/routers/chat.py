import time
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from rag_shared import Settings

from ..dependencies import get_settings_dep, get_weaviate_dep
from ..models import ChatQuery, ChatResponse, SourceDocument
from ..services.generation import generate_answer, generate_conversation_title, validate_generation_settings, GenerationMetrics
from ..services.memory import build_memory_transcript
from ..services.persistence import record_chat_interaction
from ..services.retrieval import retrieve_documents

router = APIRouter(prefix="/v1/chat", tags=["chat"])
logger = logging.getLogger(__name__)

class ChatMetrics(BaseModel):
    """Extended metrics for chat operations"""
    retrieval_time_ms: int
    generation_time_ms: int
    total_time_ms: int
    chunks_retrieved: int
    tokens_used: int
    model_used: str

@router.post("", response_model=ChatResponse)
async def chat(
    query: ChatQuery, 
    settings: Settings = Depends(get_settings_dep), 
    client=Depends(get_weaviate_dep)
):
    """
    Enhanced chat endpoint with comprehensive error handling and metrics
    """
    start_time = time.perf_counter()
    
    # Validate generation settings
    validation_issues = validate_generation_settings(settings)
    if validation_issues:
        logger.error(f"Generation settings validation failed: {validation_issues}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM configuration issues: {'; '.join(validation_issues)}",
        )

    # Validate query input
    if not query.query or not query.query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query cannot be empty"
        )
    
    if len(query.query) > 10000:  # Reasonable limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query too long (max 10,000 characters)"
        )

    # Set up principals with proper defaults
    principals = list(query.principals) if query.principals else []
    if settings.enable_permission_filters and not principals:
        principals = [settings.default_public_principal]

    logger.info(f"Processing chat query from user {query.user_id}: {query.query[:100]}...")

    try:
        # Build conversation history
        history_start = time.perf_counter()
        history = await build_memory_transcript(
            conversation_id=query.conversation_id,
            settings=settings,
        )
        history_time = time.perf_counter() - history_start
        logger.debug(f"Built conversation history in {history_time*1000:.1f}ms")

        # Retrieve relevant documents
        retrieval_start = time.perf_counter()
        chunks = await retrieve_documents(
            client=client,
            index_name=settings.weaviate_index,
            query=query.query,
            top_k=query.top_k,
            settings=settings,
            principals=principals,
        )
        retrieval_time = time.perf_counter() - retrieval_start
        retrieval_time_ms = int(retrieval_time * 1000)
        
        logger.info(f"Retrieved {len(chunks)} chunks in {retrieval_time_ms}ms")

        # Generate answer with enhanced service
        generation_start = time.perf_counter()
        answer, generation_metrics = await generate_answer(
            settings=settings,
            query=query.query,
            chunks=chunks,
            history=history,
            use_enhanced_prompt=True,
            max_retries=3,
            timeout_seconds=30,
        )
        generation_time = time.perf_counter() - generation_start
        generation_time_ms = int(generation_time * 1000)

        # Calculate total latency
        total_time = time.perf_counter() - start_time
        total_time_ms = int(total_time * 1000)

        # Prepare source documents
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

        # Record the interaction with enhanced metrics
        conversation_id, message_id = await record_chat_interaction(
            conversation_id=query.conversation_id,
            query=query.query,
            answer=answer,
            sources=[source.model_dump() for source in sources],
            latency_ms=total_time_ms,
            user_id=query.user_id,
            principals=principals,
        )

        # Log comprehensive metrics
        chat_metrics = ChatMetrics(
            retrieval_time_ms=retrieval_time_ms,
            generation_time_ms=generation_time_ms,
            total_time_ms=total_time_ms,
            chunks_retrieved=len(chunks),
            tokens_used=generation_metrics.tokens_used if generation_metrics else 0,
            model_used=generation_metrics.model_used if generation_metrics else settings.openai_model
        )
        
        logger.info(f"Chat completed successfully: {chat_metrics.model_dump()}")

        # Generate conversation title for new conversations
        if not query.conversation_id and query.user_id:
            try:
                title = await generate_conversation_title(
                    settings=settings,
                    first_message=query.query
                )
                # Note: You might want to update the conversation title in the database here
                logger.debug(f"Generated conversation title: {title}")
            except Exception as e:
                logger.warning(f"Failed to generate conversation title: {str(e)}")

        return ChatResponse(
            query=query.query,
            answer=answer,
            sources=sources,
            conversation_id=conversation_id,
            message_id=message_id,
        )

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    
    except ValueError as e:
        logger.error(f"Validation error in chat: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    except Exception as e:
        logger.error(f"Unexpected error in chat: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing your request. Please try again."
        )

@router.get("/health")
async def chat_health_check(settings: Settings = Depends(get_settings_dep)):
    """
    Health check endpoint for chat service
    """
    try:
        # Validate generation settings
        validation_issues = validate_generation_settings(settings)
        
        health_status = {
            "status": "healthy" if not validation_issues else "degraded",
            "timestamp": time.time(),
            "model": settings.openai_model,
            "issues": validation_issues
        }
        
        if validation_issues:
            logger.warning(f"Chat service health check found issues: {validation_issues}")
            return HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=health_status
            )
        
        return health_status
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "unhealthy", "error": str(e)}
        )

@router.get("/models")
async def list_available_models(settings: Settings = Depends(get_settings_dep)):
    """
    List available models and current configuration
    """
    return {
        "current_model": settings.openai_model,
        "supported_models": [
            "gpt-4",
            "gpt-4-turbo", 
            "gpt-4-turbo-preview",
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-16k"
        ],
        "api_configured": bool(settings.openai_api_key)
    }
