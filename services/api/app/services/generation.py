from __future__ import annotations

from typing import List

from langchain.prompts import PromptTemplate
from openai import AsyncOpenAI

from rag_shared import DocumentChunk, Settings


PROMPT_TEMPLATE = """You are a helpful assistant. Use the conversation history and provided context to answer the question.
If the answer cannot be determined from the context, say you do not know.

Conversation history:
{history}

Question: {question}

Context:
{context}

Answer: """


def _format_context(chunks: List[DocumentChunk]) -> str:
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
) -> str:
    template = PromptTemplate.from_template(PROMPT_TEMPLATE)
    prompt = template.format(
        question=query,
        context=_format_context(chunks),
        history=history or "None",
    )

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    return response.choices[0].message.content or ""
