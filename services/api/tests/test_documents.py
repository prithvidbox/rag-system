from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app
from app.services import ingestion as ingestion_service

PDF_SAMPLE = (
    b"%PDF-1.1\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
    b"4 0 obj\n<< /Length 55 >>\nstream\nBT /F1 24 Tf 10 100 Td (Hello PDF) Tj ET\nendstream\nendobj\n"
    b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    b"xref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000061 00000 n \n0000000116 00000 n \n0000000203 00000 n \n0000000284 00000 n \n"
    b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n334\n%%EOF\n"
)


async def _noop_init_db(settings):  # pragma: no cover
    return None


async def _noop_close_db():  # pragma: no cover
    return None


def _build_client(monkeypatch):
    monkeypatch.setattr("app.main.init_db", _noop_init_db)
    monkeypatch.setattr("app.main.close_db", _noop_close_db)

    app = create_app()
    client = TestClient(app)
    captured = {}

    def fake_enqueue_ingest_document(**kwargs):
        captured.update(kwargs)
        return {"document_id": "doc-1", "task_id": "task-1"}

    monkeypatch.setattr(ingestion_service, "enqueue_ingest_document", fake_enqueue_ingest_document)
    return client, captured


def test_document_ingest_route(monkeypatch):
    client, captured = _build_client(monkeypatch)

    response = client.post("/v1/documents", json={"text": "hello world"})
    assert response.status_code == 202
    payload = response.json()
    assert payload["document_id"] == "doc-1"
    assert payload["status"] == "queued"
    assert captured["text"] == "hello world"


def test_upload_text_document(monkeypatch):
    client, captured = _build_client(monkeypatch)

    response = client.post(
        "/v1/documents/upload",
        files={"file": ("notes.txt", b"Sample text body", "text/plain")},
    )

    assert response.status_code == 202
    assert "Sample text body" == captured["text"]
    assert captured["metadata"]["filename"] == "notes.txt"


def test_upload_pdf_document(monkeypatch):
    client, captured = _build_client(monkeypatch)

    response = client.post(
        "/v1/documents/upload",
        files={"file": ("sample.pdf", PDF_SAMPLE, "application/pdf")},
    )

    assert response.status_code == 202
    assert "Hello PDF" in captured["text"]
    assert captured["metadata"]["filename"] == "sample.pdf"


def test_upload_unsupported_document(monkeypatch):
    client, _captured = _build_client(monkeypatch)

    response = client.post(
        "/v1/documents/upload",
        files={"file": ("image.png", b"\x89PNG\r\n", "image/png")},
    )

    assert response.status_code == 415
    assert "Unsupported file type" in response.json()["detail"]


def test_document_status_endpoint(monkeypatch):
    client, _captured = _build_client(monkeypatch)

    class DummyResult:
        def __init__(self, state, info):
            self.state = state
            self.info = info

    class DummyCelery:
        def AsyncResult(self, task_id):
            assert task_id == "task-123"
            return DummyResult("PROCESSING", {"stage": "embedding", "document_id": "doc-99"})

    monkeypatch.setattr("app.routers.documents.get_celery_app", lambda: DummyCelery())

    response = client.get("/v1/documents/status/task-123")
    assert response.status_code == 200
    payload = response.json()
    assert payload["state"] == "PROCESSING"
    assert payload["stage"] == "embedding"
    assert payload["document_id"] == "doc-99"
