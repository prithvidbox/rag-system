from fastapi.testclient import TestClient

from app.main import create_app
from app.services import persistence as persistence_service


async def _noop_init_db(settings):  # pragma: no cover
    return None


async def _noop_close_db():  # pragma: no cover
    return None


def test_feedback_route(monkeypatch):
    monkeypatch.setattr("app.main.init_db", _noop_init_db)
    monkeypatch.setattr("app.main.close_db", _noop_close_db)

    def fake_record_feedback(**kwargs):
        return "feedback-1"

    monkeypatch.setattr(persistence_service, "record_feedback", fake_record_feedback)

    app = create_app()
    client = TestClient(app)

    response = client.post(
        "/v1/feedback",
        json={"message_id": "message-1", "rating": 4},
    )
    assert response.status_code == 202
    payload = response.json()
    assert payload["feedback_id"] == "feedback-1"
    assert payload["status"] == "recorded"
