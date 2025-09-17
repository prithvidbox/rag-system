"""Celery client helpers for the API service."""
from functools import lru_cache

from celery import Celery

from rag_shared import Settings, get_settings


@lru_cache(maxsize=1)
def get_celery_app() -> Celery:
    settings: Settings = get_settings()
    app = Celery(
        "rag.api",
        broker=settings.redis_url,
        backend=settings.redis_url,
    )
    app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        task_default_queue="ingestion",
    )
    return app
