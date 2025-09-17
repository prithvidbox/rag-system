from fastapi.testclient import TestClient

from app.main import create_app
from app.services import generation as generation_service
from app.services import persistence as persistence_service
from app.services import retrieval as retrieval_service


async def _noop_init_db(settings):  # pragma: no cover
    return None


async def _noop_close_db():  # pragma: no cover
    return None


def test_chat_with_permission_defaults(monkeypatch):
    monkeypatch.setenv("RAG_SHARED__OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("app.main.init_db", _noop_init_db)
    monkeypatch.setattr("app.main.close_db", _noop_close_db)

    async def fake_retrieve_documents(*args, **kwargs):  # pragma: no cover - simplified stub
        return []

    async def fake_generate_answer(*args, **kwargs):  # pragma: no cover
        return "No documents found"

    async def fake_memory(*args, **kwargs):  # pragma: no cover
        return ""

    async def fake_record_chat_interaction(**kwargs):  # pragma: no cover
        return "conv-id", "msg-id"

    monkeypatch.setattr(retrieval_service, "retrieve_documents", fake_retrieve_documents)
    monkeypatch.setattr(generation_service, "generate_answer", fake_generate_answer)
    monkeypatch.setattr(persistence_service, "record_chat_interaction", fake_record_chat_interaction)
    monkeypatch.setattr("app.services.memory.build_memory_transcript", fake_memory)

    app = create_app()
    client = TestClient(app)

    response = client.post(
        "/v1/chat",
        json={"query": "Hello", "principals": [], "user_id": "user-1"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["conversation_id"] == "conv-id"
    assert payload["message_id"] == "msg-id"
