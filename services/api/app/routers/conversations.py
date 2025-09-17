from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Path, status

from ..db.models import User
from ..models import (
    ConversationCreateRequest,
    ConversationResponse,
    ConversationUpdateRequest,
    MessageResponse,
)
from ..security import get_current_user
from ..services.persistence import (
    create_conversation_for_user,
    get_conversation_for_user,
    list_conversations_for_user,
    list_messages_for_conversation,
    rename_conversation,
)

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])


def _to_conversation_response(conversation) -> ConversationResponse:
    return ConversationResponse(
        id=str(conversation.id),
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


def _message_to_response(message) -> MessageResponse:
    content = message.content or ""
    if message.role == "assistant" and message.response:
        content = message.response
    return MessageResponse(
        id=str(message.id),
        role=message.role,
        content=content,
        created_at=message.created_at,
    )


@router.get("", response_model=List[ConversationResponse])
async def list_conversations(current_user: User = Depends(get_current_user)):
    conversations = await list_conversations_for_user(current_user)
    return [_to_conversation_response(conversation) for conversation in conversations]


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreateRequest,
    current_user: User = Depends(get_current_user),
):
    conversation = await create_conversation_for_user(current_user, payload.title)
    return _to_conversation_response(conversation)


@router.put("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    payload: ConversationUpdateRequest,
    conversation_id: str = Path(..., description="Conversation identifier"),
    current_user: User = Depends(get_current_user),
):
    try:
        conversation = await get_conversation_for_user(conversation_id, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid conversation_id") from exc

    conversation = await rename_conversation(conversation, payload.title)
    return _to_conversation_response(conversation)


@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_conversation_messages(
    conversation_id: str = Path(..., description="Conversation identifier"),
    current_user: User = Depends(get_current_user),
):
    try:
        conversation = await get_conversation_for_user(conversation_id, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid conversation_id") from exc

    messages = await list_messages_for_conversation(conversation)
    return [_message_to_response(message) for message in messages]
