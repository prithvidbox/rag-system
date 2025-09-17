"""Celery tasks for syncing SharePoint content."""
from __future__ import annotations

import logging
from typing import List

from rag_shared import Settings, get_settings

from . import celery_app
from .connectors import SharePointConnector
from .tasks import ingest_document

logger = logging.getLogger(__name__)
settings: Settings = get_settings()


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def sync_sharepoint_site(self, site_id: str, credentials: dict | None = None) -> int:
    """Full sync for a SharePoint site."""

    connector = SharePointConnector(settings=settings, credentials=credentials)
    processed = 0
    for document in connector.iter_site_pages(site_id):
        metadata = {
            **document.metadata,
            "connector": "sharepoint",
        }
        ingest_document.delay(
            document_id=document.id,
            source="sharepoint",
            text=document.content,
            metadata=metadata,
            allowed_principals=document.allowed_principals,
        )
        processed += 1
    logger.info("sharepoint sync enqueued", extra={"site_id": site_id, "documents": processed})
    return processed


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def sync_sharepoint_all_sites(self, integration_payload: dict) -> int:
    """Sync SharePoint for a payload containing credentials and site IDs."""

    site_ids: List[str] = integration_payload.get("site_ids", [])
    credentials = integration_payload.get("credentials", {})
    if not site_ids:
        logger.warning("No site_ids provided for SharePoint sync")
        return 0
    for site_id in site_ids:
        sync_sharepoint_site.delay(site_id, credentials=credentials)
    return len(site_ids)
