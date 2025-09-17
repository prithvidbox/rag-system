"""Helper functions to interact with worker tasks."""
from __future__ import annotations

from typing import Dict, List

from rag_shared.tasks import create_celery_app

celery_app = create_celery_app()


def enqueue_sharepoint_sync(*, credentials: Dict[str, str], site_ids: List[str]) -> str:
    payload = {
        "credentials": credentials,
        "site_ids": site_ids,
    }
    task = celery_app.send_task(
        "worker.sharepoint_tasks.sync_sharepoint_all_sites",
        kwargs={"integration_payload": payload},
    )
    return task.id
