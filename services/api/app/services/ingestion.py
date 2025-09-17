"""Ingestion helpers invoked by the API layer."""
from __future__ import annotations

import uuid
from typing import Dict, List, Optional

from rag_shared import Settings

from .taskqueue import get_celery_app


def enqueue_ingest_document(
    *,
    settings: Settings,
    text: str,
    source: Optional[str] = None,
    document_id: Optional[str] = None,
    metadata: Optional[Dict] = None,
    allowed_principals: Optional[List[str]] = None,
) -> Dict[str, str]:
    """Queue a document for ingestion and return identifiers."""

    celery_app = get_celery_app()
    doc_id = document_id or str(uuid.uuid4())
    payload = {
        "document_id": doc_id,
        "source": source or settings.ingestion_default_source,
        "text": text,
        "metadata": metadata or {},
        "allowed_principals": allowed_principals or [settings.default_public_principal],
    }
    task = celery_app.send_task("worker.tasks.ingest_document", kwargs=payload)
    return {"document_id": doc_id, "task_id": task.id}
