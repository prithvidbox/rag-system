from datetime import datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import create_app
from app.security import get_current_user
from app.services import persistence as persistence_service


async def _noop_init_db(settings):  # pragma: no cover
    return None


async def _noop_close_db():  # pragma: no cover
    return None


def test_conversation_endpoints(monkeypatch):
    monkeypatch.setenv("RAG_SHARED__OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("app.main.init_db", _noop_init_db)
    monkeypatch.setattr("app.main.close_db", _noop_close_db)

    fake_user = SimpleNamespace(id="user-1", email="user@example.com")

    async def fake_get_current_user():  # pragma: no cover
        return fake_user

    now = datetime.utcnow()
    fake_conversation = SimpleNamespace(
        id="conv-1",
        title="Sample conversation",
        created_at=now,
        updated_at=now,
    )

    async def fake_list_conversations(user):  # pragma: no cover
        return [fake_conversation]

    async def fake_create_conversation(user, title):  # pragma: no cover
        return SimpleNamespace(id="conv-2", title=title or "New chat", created_at=now, updated_at=now)

    async def fake_get_conversation(cid, user):  # pragma: no cover
        if cid != "conv-1":
            raise LookupError
        return fake_conversation

    async def fake_list_messages(conversation):  # pragma: no cover
        return [
            SimpleNamespace(id="msg-1", role="user", content="Hello", response=None, created_at=now),
            SimpleNamespace(id="msg-2", role="assistant", content=None, response="Hi there", created_at=now),
        ]

    async def fake_rename(conversation, title):  # pragma: no cover
        conversation.title = title
        conversation.updated_at = now
        return conversation

    monkeypatch.setattr(persistence_service, "list_conversations_for_user", fake_list_conversations)
    monkeypatch.setattr(persistence_service, "create_conversation_for_user", fake_create_conversation)
    monkeypatch.setattr(persistence_service, "get_conversation_for_user", fake_get_conversation)
    monkeypatch.setattr(persistence_service, "list_messages_for_conversation", fake_list_messages)
    monkeypatch.setattr(persistence_service, "rename_conversation", fake_rename)

    app = create_app()
    app.dependency_overrides[get_current_user] = fake_get_current_user
    client = TestClient(app)

    response = client.get("/v1/conversations")
    assert response.status_code == 200
    conversations = response.json()
    assert conversations[0]["id"] == "conv-1"

    response = client.post("/v1/conversations", json={})
    assert response.status_code == 201
    assert response.json()["id"] == "conv-2"

    response = client.get("/v1/conversations/conv-1/messages")
    assert response.status_code == 200
    messages = response.json()
    assert messages[0]["role"] == "user"
    assert messages[1]["content"] == "Hi there"

    response = client.put("/v1/conversations/conv-1", json={"title": "Renamed"})
    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"
