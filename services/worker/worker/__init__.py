"""Celery worker for ingestion and maintenance tasks."""
from rag_shared.tasks import create_celery_app

celery_app = create_celery_app()

__all__ = ["celery_app"]
