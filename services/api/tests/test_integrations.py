from fastapi.testclient import TestClient

from app.main import create_app
from app.security import get_current_user
from app import workers as worker_module
from app.routers import integrations as integrations_router

async def _noop_init_db(settings):  # pragma: no cover
    return None

async def _noop_close_db():  # pragma: no cover
    return None


def test_integrations_endpoints(monkeypatch):
    monkeypatch.setenv("RAG_SHARED__OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("app.main.init_db", _noop_init_db)
    monkeypatch.setattr("app.main.close_db", _noop_close_db)

    fake_user = type("User", (), {"id": "user-1"})()

    async def fake_get_current_user():  # pragma: no cover
        return fake_user

    fake_integration = type(
        "Integration",
        (),
        {
            "id": "integration-1",
            "name": "SharePoint",
            "integration_type": "sharepoint",
            "config": {"tenant_id": "tenant"},
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z",
        },
    )

    class FakeQuery:
        def __init__(self, value):
            self.value = value

        async def all(self):  # pragma: no cover
            return self.value

        def order_by(self, *_args, **_kwargs):
            return self

    async def fake_create(**kwargs):  # pragma: no cover
        return fake_integration

    async def fake_sync_create(**kwargs):  # pragma: no cover
        return type(
            "IntegrationSync",
            (),
            {
                "id": "sync-1",
                "status": "queued",
                "message": None,
                "task_id": "task-id",
                "created_at": "2025-01-01T00:00:00Z",
                "updated_at": "2025-01-01T00:00:00Z",
            },
        )

    monkeypatch.setattr(integrations_router.Integration, "filter", classmethod(lambda cls, **kwargs: FakeQuery([fake_integration])))
    monkeypatch.setattr(integrations_router.Integration, "create", classmethod(lambda cls, **kwargs: fake_integration))
    monkeypatch.setattr(integrations_router.Integration, "get_or_none", classmethod(lambda cls, **kwargs: fake_integration))
    monkeypatch.setattr(integrations_router.IntegrationSync, "filter", classmethod(lambda cls, **kwargs: FakeQuery([])))
    monkeypatch.setattr(integrations_router.IntegrationSync, "create", classmethod(lambda cls, **kwargs: fake_sync_create(**kwargs)))

    monkeypatch.setattr(worker_module, "enqueue_sharepoint_sync", lambda **kwargs: "task-id")

    class FakeAsyncResult:
        def __init__(self, _task_id):
            self.state = "SUCCESS"
            self.info = None

    monkeypatch.setattr(worker_module.celery_app, "AsyncResult", lambda task_id: FakeAsyncResult(task_id))

    app = create_app()
    app.dependency_overrides[get_current_user] = fake_get_current_user
    client = TestClient(app)

    response = client.get("/v1/integrations")
    assert response.status_code == 200
    assert response.json()[0]["integration_type"] == "sharepoint"

    response = client.post(
        "/v1/integrations",
        json={"name": "SharePoint", "integration_type": "sharepoint", "config": {}},
    )
    assert response.status_code == 201

    response = client.post(
        "/v1/integrations/integration-1/sync",
        json={},
    )
    assert response.status_code == 202
    assert response.json()["task_id"] == "task-id"

    response = client.get("/v1/integrations/integration-1/sync")
    assert response.status_code == 200
