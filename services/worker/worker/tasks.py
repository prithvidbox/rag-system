from __future__ import annotations

import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Dict, List

import requests

from rag_shared import DocumentChunk, Settings, configure_logging, get_settings, get_weaviate_client

from . import celery_app

logger = logging.getLogger(__name__)

configure_logging("worker")
settings: Settings = get_settings()
client = get_weaviate_client()
INBOX_PATH = Path(settings.ingestion_watch_path)
PROCESSED_PATH = Path(settings.ingestion_processed_path)


def _resolve_chunk_params(chunk_size: int | None = None, overlap: int | None = None) -> tuple[int, int]:
    size = chunk_size or settings.ingestion_chunk_size
    overlap_value = settings.ingestion_chunk_overlap if overlap is None else overlap
    if size <= 0:
        size = 1
    if overlap_value < 0:
        overlap_value = 0
    if overlap_value >= size:
        overlap_value = max(size - 1, 0)
    return size, overlap_value


def chunk_text(text: str, chunk_size: int | None = None, overlap: int | None = None) -> List[str]:
    chunk_size, overlap = _resolve_chunk_params(chunk_size, overlap)
    words = text.split()
    chunks: List[str] = []
    start = 0
    while start < len(words):
        end = min(len(words), start + chunk_size)
        chunk_words = words[start:end]
        chunk = " ".join(chunk_words)
        chunks.append(chunk)
        start = end - overlap
        if start < 0:
            start = 0
    return chunks


def embed_chunks(chunks: List[str]) -> List[List[float]]:
    payload = {"texts": chunks, "model": settings.embedding_model}
    response = requests.post(f"{settings.embedding_service_url}/v1/embed", json=payload, timeout=60)
    response.raise_for_status()
    data = response.json()
    return data["embeddings"]


def upsert_chunks(chunks: List[DocumentChunk], vectors: List[List[float]]) -> None:
    with client.batch as batch:
        batch.batch_size = 20
        for chunk, vector in zip(chunks, vectors):
            properties = {
                "chunk_id": chunk.id,
                "text": chunk.text,
                "source": chunk.source,
                "document_id": chunk.document_id,
                "metadata": json.dumps(chunk.metadata, ensure_ascii=False),
                "allowed_principals": chunk.allowed_principals,
            }
            batch.add_data_object(
                data_object=properties,
                class_name=settings.weaviate_index,
                vector=vector,
                uuid=chunk.id,
            )


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def ingest_document(
    self,
    *,
    document_id: str,
    source: str,
    text: str,
    metadata: Dict | None = None,
    allowed_principals: List[str] | None = None,
) -> Dict[str, str]:
    metadata = metadata or {}
    principals = allowed_principals or [settings.default_public_principal]
    logger.info("ingesting document", extra={"document_id": document_id, "source": source})

    self.update_state(state="STARTED", meta={"stage": "chunking", "document_id": document_id})

    raw_chunks = chunk_text(text)
    document_chunks: List[DocumentChunk] = []
    for chunk in raw_chunks:
        chunk_id = str(uuid.uuid4())
        chunk_metadata = {"document_id": document_id, **metadata}
        document_chunks.append(
            DocumentChunk(
                id=chunk_id,
                text=chunk,
                source=source,
                document_id=document_id,
                metadata=chunk_metadata,
                allowed_principals=principals,
            )
        )
    self.update_state(
        state="PROCESSING",
        meta={
            "stage": "embedding",
            "document_id": document_id,
            "chunks": len(document_chunks),
        },
    )

    vectors = embed_chunks([chunk.text for chunk in document_chunks])
    self.update_state(
        state="PROCESSING",
        meta={
            "stage": "indexing",
            "document_id": document_id,
            "chunks": len(document_chunks),
        },
    )
    upsert_chunks(document_chunks, vectors)
    self.update_state(state="PROCESSING", meta={"stage": "finalizing", "document_id": document_id})
    logger.info("ingestion complete", extra={"document_id": document_id, "chunks": len(document_chunks)})
    return {"document_id": document_id, "stage": "completed"}


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def sync_ingestion_inbox(self) -> int:
    """Scan the ingestion inbox for new files and enqueue them."""

    ensure_ingestion_paths()
    ingested = 0
    for path in sorted(INBOX_PATH.glob("*.txt")):
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            logger.warning("Skipping non-UTF8 file", extra={"path": str(path)})
            continue

        metadata = {"filename": path.name}
        document_id = path.stem
        ingest_document.delay(
            document_id=document_id,
            source="file_watch",
            text=text,
            metadata=metadata,
        )
        destination = PROCESSED_PATH / path.name
        shutil.move(path, destination)
        ingested += 1
        logger.info(
            "queued document from inbox",
            extra={"document_id": document_id, "path": str(destination)},
        )

    return ingested


def ensure_ingestion_paths() -> None:
    INBOX_PATH.mkdir(parents=True, exist_ok=True)
    PROCESSED_PATH.mkdir(parents=True, exist_ok=True)


celery_app.conf.beat_schedule = {
    "sync-ingestion-inbox": {
        "task": "worker.tasks.sync_ingestion_inbox",
        "schedule": settings.ingestion_schedule_interval,
    }
}
celery_app.conf.timezone = "UTC"
