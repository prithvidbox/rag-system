from __future__ import annotations

import uuid
from typing import Optional

from tortoise import fields
from tortoise.models import Model


class User(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    email = fields.CharField(max_length=255, unique=True)
    hashed_password = fields.CharField(max_length=255)
    display_name = fields.CharField(max_length=255, null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    conversations: fields.ReverseRelation["Conversation"]
    integrations: fields.ReverseRelation["Integration"]

    class Meta:
        table = "users"


class Conversation(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    title = fields.CharField(max_length=255, null=True)
    owner = fields.ForeignKeyField("models.User", related_name="conversations", null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    messages: fields.ReverseRelation["Message"]

    class Meta:
        table = "conversations"


class Message(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    conversation = fields.ForeignKeyField("models.Conversation", related_name="messages")
    role = fields.CharField(max_length=16)
    content = fields.TextField()
    response = fields.TextField(null=True)
    sources = fields.JSONField(null=True)
    latency_ms = fields.IntField(null=True)
    principal_snapshot = fields.JSONField(null=True)
    user_id = fields.CharField(max_length=255, null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    feedback: fields.ReverseRelation["Feedback"]

    class Meta:
        table = "messages"


class Feedback(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    message = fields.ForeignKeyField("models.Message", related_name="feedback")
    rating = fields.IntField()
    comment = fields.TextField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "feedback"


class Integration(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    user = fields.ForeignKeyField("models.User", related_name="integrations")
    integration_type = fields.CharField(max_length=64)
    name = fields.CharField(max_length=255)
    config = fields.JSONField()
    status = fields.CharField(max_length=32, default="available")
    last_connection_check = fields.DatetimeField(null=True)
    connection_message = fields.TextField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "integrations"
        unique_together = ("user", "name")


class IntegrationSync(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    integration = fields.ForeignKeyField("models.Integration", related_name="syncs")
    status = fields.CharField(max_length=32, default="queued")
    payload = fields.JSONField(null=True)
    message = fields.TextField(null=True)
    task_id = fields.CharField(max_length=255, null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "integration_syncs"
        indexes = ("integration_id",)
