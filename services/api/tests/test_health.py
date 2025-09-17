from fastapi.testclient import TestClient

from app.main import create_app


async def _noop_init_db(settings):  # pragma: no cover
    return None


async def _noop_close_db():  # pragma: no cover
    return None


def test_health_endpoint(monkeypatch):
    monkeypatch.setattr("app.main.init_db", _noop_init_db)
    monkeypatch.setattr("app.main.close_db", _noop_close_db)
    app = create_app()
    client = TestClient(app)
    response = client.get("/system/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
