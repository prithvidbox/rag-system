from __future__ import annotations

from typing import List, Sequence
from uuid import UUID

from langchain.memory import ConversationBufferWindowMemory

from rag_shared import Settings

from ..db.models import Message


async def load_conversation_messages(conversation_id: UUID, limit: int) -> Sequence[Message]:
    return await Message.filter(conversation_id=conversation_id).order_by("created_at").limit(limit * 2)


async def build_memory_transcript(
    *,
    conversation_id: str | None,
    settings: Settings,
) -> str:
    if not conversation_id:
        return ""
    try:
        convo_uuid = UUID(conversation_id)
    except ValueError:
        return ""

    messages = await load_conversation_messages(convo_uuid, settings.memory_window_size)
    if not messages:
        return ""

    memory = ConversationBufferWindowMemory(k=settings.memory_window_size, return_messages=True)
    for message in messages:
        content = message.content or ""
        if message.role == "user" and settings.memory_include_user_messages:
            memory.chat_memory.add_user_message(content)
        elif message.role == "assistant" and settings.memory_include_assistant_messages:
            payload = message.response or content
            memory.chat_memory.add_ai_message(payload)

    history_payload = memory.load_memory_variables({}).get("history")
    if not history_payload:
        return ""

    if isinstance(history_payload, str):
        return history_payload

    transcript_lines: List[str] = []
    for msg in history_payload:  # type: ignore[assignment]
        role = getattr(msg, "type", None) or getattr(msg, "role", "assistant")
        content = getattr(msg, "content", "")
        transcript_lines.append(f"{role.capitalize()}: {content}")
    return "\n".join(transcript_lines)
