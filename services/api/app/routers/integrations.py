from __future__ import annotations

from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from ..db.models import Integration, IntegrationSync, User
from ..models import IntegrationRequest, IntegrationResponse, IntegrationSyncResponse
from ..security import get_current_user
from ..workers import celery_app, enqueue_sharepoint_sync

router = APIRouter(prefix="/v1/integrations", tags=["integrations"])


def _to_response(integration: Integration) -> IntegrationResponse:
    return IntegrationResponse(
        id=str(integration.id),
        name=integration.name,
        integration_type=integration.integration_type,
        config=integration.config,
        status=integration.status,
        last_connection_check=integration.last_connection_check,
        connection_message=integration.connection_message,
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


@router.get("", response_model=list[IntegrationResponse])
async def list_integrations(current_user: User = Depends(get_current_user)):
    integrations = await Integration.filter(user=current_user).all()
    return [_to_response(integration) for integration in integrations]


@router.post("", response_model=IntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_integration(
    payload: IntegrationRequest,
    current_user: User = Depends(get_current_user),
):
    integration = await Integration.create(
        user=current_user,
        name=payload.name,
        integration_type=payload.integration_type,
        config=payload.config,
    )
    return _to_response(integration)


@router.put("/{integration_id}", response_model=IntegrationResponse)
async def update_integration(
    integration_id: str,
    payload: IntegrationRequest,
    current_user: User = Depends(get_current_user),
):
    integration = await Integration.get_or_none(id=integration_id, user=current_user)
    if integration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    integration.name = payload.name
    integration.integration_type = payload.integration_type
    integration.config = payload.config
    await integration.save()
    return _to_response(integration)


@router.delete("/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(integration_id: str, current_user: User = Depends(get_current_user)):
    integration = await Integration.get_or_none(id=integration_id, user=current_user)
    if integration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    await integration.delete()
    return None


@router.post("/{integration_id}/sync", response_model=IntegrationSyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_sync(integration_id: str, current_user: User = Depends(get_current_user)):
    integration = await Integration.get_or_none(id=integration_id, user=current_user)
    if integration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    if integration.integration_type != "sharepoint":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sync not supported for this integration type")

    credentials = {
        "tenant_id": integration.config.get("tenant_id"),
        "client_id": integration.config.get("client_id"),
        "client_secret": integration.config.get("client_secret"),
    }
    site_config = integration.config.get("site_ids")
    site_ids = site_config if isinstance(site_config, list) else [site_config] if site_config else []
    task_id = enqueue_sharepoint_sync(credentials=credentials, site_ids=site_ids)

    sync_record = await IntegrationSync.create(
        integration=integration,
        status="queued",
        payload={"site_ids": site_ids},
        task_id=task_id,
    )

    integration.status = "syncing"
    integration.updated_at = datetime.utcnow()
    await integration.save(update_fields=["status", "updated_at"])

    return IntegrationSyncResponse(
        id=str(sync_record.id),
        status=sync_record.status,
        message=sync_record.message,
        task_id=sync_record.task_id,
        created_at=sync_record.created_at,
        updated_at=sync_record.updated_at,
    )


@router.get("/{integration_id}/sync", response_model=list[IntegrationSyncResponse])
async def list_sync_jobs(integration_id: str, current_user: User = Depends(get_current_user)):
    integration = await Integration.get_or_none(id=integration_id, user=current_user)
    if integration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    syncs = await IntegrationSync.filter(integration=integration).order_by("-created_at").all()
    responses: list[IntegrationSyncResponse] = []
    for record in syncs:
        status_value = record.status
        message_value = record.message
        if record.task_id:
            async_result = celery_app.AsyncResult(record.task_id)
            state = async_result.state.lower()
            if state != record.status:
                record.status = state
                if state == 'failure':
                    try:
                        message_value = str(async_result.info)
                    except Exception:  # pragma: no cover
                        message_value = 'Sync failed'
                    record.message = message_value
                elif state == 'success':
                    record.message = record.message or 'Sync completed'
                await record.save(update_fields=["status", "message"])
                status_value = record.status
                message_value = record.message
            else:
                status_value = state
        responses.append(
            IntegrationSyncResponse(
                id=str(record.id),
                status=status_value,
                message=message_value,
                task_id=record.task_id,
                created_at=record.created_at,
                updated_at=record.updated_at,
            )
        )
    return responses


@router.post("/{integration_id}/test", response_model=IntegrationResponse)
async def test_integration_connection(
    integration_id: str,
    current_user: User = Depends(get_current_user),
):
    integration = await Integration.get_or_none(id=integration_id, user=current_user)
    if integration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")
    if integration.integration_type != "sharepoint":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test unsupported for this integration type")

    tenant_id = integration.config.get("tenant_id")
    client_id = integration.config.get("client_id")
    client_secret = integration.config.get("client_secret")
    site_config = integration.config.get("site_ids")
    site_ids = site_config if isinstance(site_config, list) else [site_config] if site_config else []

    status_value = "live"
    message_value: str | None = "Connection successful"
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    payload = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://graph.microsoft.com/.default",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(token_url, data=payload)
            response.raise_for_status()
        if not site_ids:
            message_value = "Authenticated. Add site IDs to enable syncing."
    except httpx.HTTPStatusError as exc:
        status_value = "unreachable"
        message_value = f"Authentication failed: {exc.response.text}"[:300]
    except Exception as exc:  # pragma: no cover - unexpected failures
        status_value = "unreachable"
        message_value = str(exc)

    integration.status = status_value
    integration.last_connection_check = datetime.utcnow()
    integration.connection_message = message_value
    await integration.save(update_fields=["status", "last_connection_check", "connection_message", "updated_at"])

    return _to_response(integration)
