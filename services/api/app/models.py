from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, model_validator


class ChatQuery(BaseModel):
    query: str = Field(..., description="User query text")
    conversation_id: Optional[str] = Field(None, description="Conversation identifier")
    top_k: int = Field(5, ge=1, le=20, description="Number of documents to retrieve")
    principals: List[str] = Field(default_factory=list, description="Principals of the caller")
    user_id: Optional[str] = Field(None, description="User ID for auditing")


class SourceDocument(BaseModel):
    id: str
    text: str
    source: str
    score: Optional[float] = None
    metadata: dict = Field(default_factory=dict)


class ChatResponse(BaseModel):
    query: str
    answer: str
    sources: List[SourceDocument]
    conversation_id: str
    message_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DocumentIngestRequest(BaseModel):
    document_id: Optional[str] = Field(None, description="Provide to overwrite existing document")
    text: Optional[str] = Field(None, description="Raw text body to ingest")
    source: Optional[str] = Field(None, description="Logical source identifier")
    metadata: Dict[str, str] = Field(default_factory=dict, description="Arbitrary metadata fields")
    allowed_principals: List[str] = Field(default_factory=list, description="Principals authorised for this document")

    @model_validator(mode="after")
    def validate_payload(self) -> "DocumentIngestRequest":
        if not self.text:
            raise ValueError("`text` field is required for ingestion")
        return self


class DocumentIngestResponse(BaseModel):
    document_id: str
    task_id: str
    status: str = "queued"


class DocumentIngestStatusResponse(BaseModel):
    task_id: str
    state: str
    stage: Optional[str] = None
    document_id: Optional[str] = None
    detail: Optional[str] = None


class FeedbackRequest(BaseModel):
    message_id: str = Field(..., description="Identifier of the assistant message to rate")
    rating: int = Field(..., ge=1, le=5, description="Rating score from 1-5")
    comment: Optional[str] = Field(None, description="Optional free-form comment")


class FeedbackResponse(BaseModel):
    feedback_id: str
    message_id: str
    status: str = "recorded"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreateRequest(BaseModel):
    email: str = Field(..., description="User email")
    password: str = Field(..., min_length=8)
    display_name: Optional[str] = Field(None)


class UserLoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str]
    created_at: datetime


class IntegrationRequest(BaseModel):
    name: str
    integration_type: str = Field(..., description="Integration identifier e.g. sharepoint")
    config: Dict[str, str] = Field(default_factory=dict)


class IntegrationResponse(BaseModel):
    id: str
    name: str
    integration_type: str
    config: Dict[str, str]
    status: str
    last_connection_check: Optional[datetime]
    connection_message: Optional[str]
    created_at: datetime
    updated_at: datetime


class IntegrationSyncResponse(BaseModel):
    id: str
    status: str
    message: Optional[str]
    task_id: Optional[str]
    created_at: datetime
    updated_at: datetime


class ConversationCreateRequest(BaseModel):
    title: Optional[str] = Field(None, description="Optional title for the conversation")


class ConversationUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, description="New title for the conversation")


class ConversationResponse(BaseModel):
    id: str
    title: Optional[str]
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime
