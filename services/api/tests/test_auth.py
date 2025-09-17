from fastapi.testclient import TestClient

from app.main import create_app
from app.db.models import User


async def _noop_init_db(settings):  # pragma: no cover
    return None


async def _noop_close_db():  # pragma: no cover
    return None


def test_signup_signin(monkeypatch):
    monkeypatch.setenv("RAG_SHARED__JWT_SECRET_KEY", "test-secret")
    monkeypatch.setenv("RAG_SHARED__OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("app.main.init_db", _noop_init_db)
    monkeypatch.setattr("app.main.close_db", _noop_close_db)

    app = create_app()
    client = TestClient(app)

    created_users = {}

    async def fake_create(**kwargs):
        user = User(id='1234', **kwargs)
        created_users[user.email] = user
        return user

    async def fake_get_or_none(**kwargs):
        email = kwargs.get('email')
        user_id = kwargs.get('id')
        if email:
            return created_users.get(email)
        if user_id == '1234':
            return next(iter(created_users.values()), None)
        return None

    monkeypatch.setattr(User, 'create', fake_create)
    monkeypatch.setattr(User, 'get_or_none', fake_get_or_none)

    response = client.post("/v1/auth/signup", json={"email": "user@example.com", "password": "password123"})
    assert response.status_code == 201

    response = client.post("/v1/auth/signin", json={"email": "user@example.com", "password": "password123"})
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert token
