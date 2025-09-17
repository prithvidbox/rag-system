from __future__ import annotations

from datetime import datetime
import uuid
from typing import Any, Dict, List, Optional, Tuple

from tortoise.exceptions import DoesNotExist

from ..db.models import Conversation, Feedback, Message, User


async def record_chat_interaction(
    *,
    conversation_id: Optional[str],
    query: str,
    answer: str,
    sources: List[Dict[str, Any]],
    latency_ms: int,
    user_id: Optional[str],
    principals: List[str],
) -> Tuple[str, str]:
    conversation = await _ensure_conversation(conversation_id, owner_id=user_id)

    await Message.create(
        conversation=conversation,
        role="user",
        content=query,
        user_id=user_id,
        principal_snapshot=principals,
    )

    assistant_message = await Message.create(
        conversation=conversation,
        role="assistant",
        content=answer,
        response=answer,
        sources=sources,
        latency_ms=latency_ms,
        user_id=user_id,
        principal_snapshot=principals,
    )

    updated_fields = ["updated_at"]
    if not conversation.title:
        conversation.title = (query[:60] or "New chat").strip()
        updated_fields.append("title")
    conversation.updated_at = datetime.utcnow()
    await conversation.save(update_fields=updated_fields)

    return str(conversation.id), str(assistant_message.id)


async def record_feedback(
    *,
    message_id: str,
    rating: int,
    comment: Optional[str] = None,
) -> str:
    message_uuid = _to_uuid(message_id)
    if message_uuid is None:
        raise ValueError("Invalid message_id")

    try:
        message = await Message.get(id=message_uuid)
    except DoesNotExist as exc:
        raise LookupError("Message not found") from exc

    feedback = await Feedback.create(message=message, rating=rating, comment=comment)
    return str(feedback.id)


async def _ensure_conversation(conversation_id: Optional[str], *, owner_id: Optional[str]) -> Conversation:
    conversation_uuid = _to_uuid(conversation_id)
    if conversation_uuid is not None:
        conversation = await Conversation.get_or_none(id=conversation_uuid)
        if conversation is None:
            owner = await _resolve_user(owner_id)
            conversation = await Conversation.create(id=conversation_uuid, owner=owner)
        else:
            if owner_id and conversation.owner_id is None:
                owner = await _resolve_user(owner_id)
                if owner:
                    conversation.owner = owner
                    await conversation.save(update_fields=["owner"])
        return conversation

    owner = await _resolve_user(owner_id)
    return await Conversation.create(owner=owner)


def _to_uuid(value: Optional[str]) -> Optional[uuid.UUID]:
    if value is None:
        return None
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError):
        return None


async def _resolve_user(user_id: Optional[str]) -> Optional[User]:
    if not user_id:
        return None
    user_uuid = _to_uuid(user_id)
    if user_uuid is None:
        return await User.get_or_none(email=user_id)
    return await User.get_or_none(id=user_uuid)


async def list_conversations_for_user(user: User) -> List[Conversation]:
    return await Conversation.filter(owner=user).order_by("-updated_at").all()


async def create_conversation_for_user(user: User, title: Optional[str]) -> Conversation:
    return await Conversation.create(owner=user, title=title)


async def get_conversation_for_user(conversation_id: str, user: User) -> Conversation:
    convo_uuid = _to_uuid(conversation_id)
    if convo_uuid is None:
        raise ValueError("Invalid conversation_id")
    conversation = await Conversation.get_or_none(id=convo_uuid, owner=user)
    if conversation is None:
        raise LookupError("Conversation not found")
    return conversation


async def list_messages_for_conversation(conversation: Conversation) -> List[Message]:
    return await Message.filter(conversation=conversation).order_by("created_at").all()


async def rename_conversation(conversation: Conversation, title: Optional[str]) -> Conversation:
    conversation.title = (title or "New chat").strip()
    conversation.updated_at = datetime.utcnow()
    await conversation.save(update_fields=["title", "updated_at"])
    return conversation
