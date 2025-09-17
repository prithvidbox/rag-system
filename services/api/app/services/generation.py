from __future__ import annotations

import logging
from typing import List, Optional
import asyncio
from datetime import datetime

from langchain.prompts import PromptTemplate
from openai import AsyncOpenAI, OpenAIError
from pydantic import BaseModel

from rag_shared import DocumentChunk, Settings

logger = logging.getLogger(__name__)

class GenerationMetrics(BaseModel):
    """Metrics for generation performance tracking"""
    tokens_used: int
    response_time_ms: int
    model_used: str
    context_chunks: int
    timestamp: datetime

ENHANCED_PROMPT_TEMPLATE = """You are an expert AI assistant with access to a comprehensive knowledge base. Your role is to provide accurate, helpful, and contextually relevant answers based on the provided information.

## Instructions:
1. Use the conversation history to maintain context and continuity
2. Base your answer primarily on the provided context documents
3. If information is incomplete, acknowledge limitations and suggest what additional information might be helpful
4. Provide specific references to sources when possible
5. Maintain a professional, clear, and engaging tone
6. If the question cannot be answered from the context, clearly state this and explain why

## Conversation History:
{history}

## Current Question:
{question}

## Knowledge Base Context:
{context}

## Response Guidelines:
- Be concise but comprehensive
- Use bullet points or numbered lists for complex information
- Include relevant details and examples from the context
- Maintain accuracy and avoid speculation beyond the provided information

## Answer:"""

FALLBACK_PROMPT_TEMPLATE = """You are a helpful AI assistant. Answer the following question based on the provided context.

Question: {question}

Context:
{context}

Answer:"""

def _format_context_enhanced(chunks: List[DocumentChunk]) -> str:
    """Format context with enhanced structure and metadata"""
    if not chunks:
        return "No relevant context found in the knowledge base."
    
    formatted_chunks = []
    for i, chunk in enumerate(chunks, 1):
        # Extract metadata for better context
        filename = chunk.metadata.get('filename', 'Unknown source')
        score = f" (Relevance: {chunk.score:.2f})" if chunk.score else ""
        
        formatted_chunk = f"""
### Source {i}: {filename}{score}
**Document ID:** {chunk.source}
**Content:**
{chunk.text.strip()}
---"""
        formatted_chunks.append(formatted_chunk)
    
    return "\n".join(formatted_chunks)

def _format_context_simple(chunks: List[DocumentChunk]) -> str:
    """Simple context formatting for fallback"""
    rows = []
    for chunk in chunks:
        rows.append(f"Source: {chunk.source}\nContent: {chunk.text}\n")
    return "\n".join(rows)

async def generate_answer(
    *,
    settings: Settings,
    query: str,
    chunks: List[DocumentChunk],
    history: str,
    use_enhanced_prompt: bool = True,
    max_retries: int = 3,
    timeout_seconds: int = 30,
) -> tuple[str, Optional[GenerationMetrics]]:
    """
    Generate an answer using OpenAI with enhanced error handling and metrics.
    
    Returns:
        Tuple of (answer, metrics)
    """
    start_time = datetime.now()
    
    # Validate inputs
    if not query.strip():
        raise ValueError("Query cannot be empty")
    
    if not settings.openai_api_key:
        raise ValueError("OpenAI API key not configured")
    
    # Choose prompt template based on settings
    if use_enhanced_prompt and len(chunks) > 0:
        template = PromptTemplate.from_template(ENHANCED_PROMPT_TEMPLATE)
        context = _format_context_enhanced(chunks)
    else:
        template = PromptTemplate.from_template(FALLBACK_PROMPT_TEMPLATE)
        context = _format_context_simple(chunks)
    
    prompt = template.format(
        question=query.strip(),
        context=context,
        history=history or "This is the start of the conversation.",
    )
    
    # Log prompt for debugging (truncated)
    logger.info(f"Generating answer for query: {query[:100]}...")
    logger.debug(f"Prompt length: {len(prompt)} characters")
    
    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        timeout=timeout_seconds
    )
    
    last_error = None
    
    for attempt in range(max_retries):
        try:
            # Add timeout wrapper
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=settings.openai_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    max_tokens=2000,  # Reasonable limit
                    top_p=0.9,
                    frequency_penalty=0.1,
                    presence_penalty=0.1,
                ),
                timeout=timeout_seconds
            )
            
            # Extract answer
            answer = response.choices[0].message.content or ""
            
            if not answer.strip():
                raise ValueError("Empty response from OpenAI")
            
            # Calculate metrics
            end_time = datetime.now()
            response_time_ms = int((end_time - start_time).total_seconds() * 1000)
            
            metrics = GenerationMetrics(
                tokens_used=response.usage.total_tokens if response.usage else 0,
                response_time_ms=response_time_ms,
                model_used=settings.openai_model,
                context_chunks=len(chunks),
                timestamp=end_time
            )
            
            logger.info(f"Successfully generated answer in {response_time_ms}ms using {metrics.tokens_used} tokens")
            
            return answer.strip(), metrics
            
        except asyncio.TimeoutError as e:
            last_error = e
            logger.warning(f"Attempt {attempt + 1} timed out after {timeout_seconds}s")
            
        except OpenAIError as e:
            last_error = e
            logger.warning(f"Attempt {attempt + 1} failed with OpenAI error: {str(e)}")
            
            # Handle rate limiting with exponential backoff
            if "rate_limit" in str(e).lower():
                wait_time = 2 ** attempt
                logger.info(f"Rate limited, waiting {wait_time}s before retry")
                await asyncio.sleep(wait_time)
            
        except Exception as e:
            last_error = e
            logger.error(f"Attempt {attempt + 1} failed with unexpected error: {str(e)}")
            
        # Wait before retry (except for last attempt)
        if attempt < max_retries - 1:
            await asyncio.sleep(1)
    
    # All retries failed
    error_msg = f"Failed to generate answer after {max_retries} attempts. Last error: {str(last_error)}"
    logger.error(error_msg)
    
    # Return a fallback response
    fallback_answer = "I apologize, but I'm currently unable to process your request due to a technical issue. Please try again in a moment."
    
    end_time = datetime.now()
    response_time_ms = int((end_time - start_time).total_seconds() * 1000)
    
    fallback_metrics = GenerationMetrics(
        tokens_used=0,
        response_time_ms=response_time_ms,
        model_used=settings.openai_model,
        context_chunks=len(chunks),
        timestamp=end_time
    )
    
    return fallback_answer, fallback_metrics

async def generate_conversation_title(
    *,
    settings: Settings,
    first_message: str,
    max_length: int = 50
) -> str:
    """Generate a concise title for a conversation based on the first message"""
    
    if not first_message.strip():
        return "New Conversation"
    
    title_prompt = f"""Generate a concise, descriptive title (max {max_length} characters) for a conversation that starts with this message:

"{first_message[:200]}"

The title should:
- Capture the main topic or intent
- Be clear and professional
- Avoid special characters
- Be suitable for a conversation list

Title:"""
    
    try:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model="gpt-3.5-turbo",  # Use faster model for titles
                messages=[{"role": "user", "content": title_prompt}],
                temperature=0.3,
                max_tokens=20,
            ),
            timeout=10
        )
        
        title = response.choices[0].message.content or ""
        title = title.strip().strip('"').strip("'")
        
        # Ensure title length
        if len(title) > max_length:
            title = title[:max_length-3] + "..."
        
        return title if title else "New Conversation"
        
    except Exception as e:
        logger.warning(f"Failed to generate conversation title: {str(e)}")
        # Fallback: use first few words of the message
        words = first_message.strip().split()[:6]
        fallback_title = " ".join(words)
        
        if len(fallback_title) > max_length:
            fallback_title = fallback_title[:max_length-3] + "..."
            
        return fallback_title if fallback_title else "New Conversation"

def validate_generation_settings(settings: Settings) -> list[str]:
    """Validate settings for generation and return list of issues"""
    issues = []
    
    if not settings.openai_api_key:
        issues.append("OpenAI API key is not configured")
    
    if not settings.openai_model:
        issues.append("OpenAI model is not specified")
    
    # Check for supported models
    supported_models = [
        "gpt-4", "gpt-4-turbo", "gpt-4-turbo-preview",
        "gpt-4o", "gpt-4o-mini",
        "gpt-3.5-turbo", "gpt-3.5-turbo-16k"
    ]
    
    if settings.openai_model not in supported_models:
        issues.append(f"Model '{settings.openai_model}' may not be supported. Supported models: {', '.join(supported_models)}")
    
    return issues
