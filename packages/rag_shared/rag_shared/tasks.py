"""Celery app factory and shared task utilities."""
from celery import Celery

from .config import get_settings


def create_celery_app() -> Celery:
    """Instantiate Celery configured from settings."""

    settings = get_settings()
    app = Celery(
        "rag.worker",
        broker=settings.redis_url,
        backend=settings.redis_url,
        include=["worker.tasks", "worker.sharepoint_tasks"],
    )
    app.conf.update(
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        task_track_started=True,
        task_time_limit=600,
        task_default_queue="ingestion",
    )
    return app
