from __future__ import annotations

import json
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from rag_shared import Settings

from ..dependencies import get_settings_dep
from celery import states

from ..models import DocumentIngestRequest, DocumentIngestResponse, DocumentIngestStatusResponse
from ..services.ingestion import enqueue_ingest_document
from ..services.taskqueue import get_celery_app
from ..utils import DocumentProcessingError, UnsupportedFileTypeError, extract_text_from_upload

router = APIRouter(prefix="/v1/documents", tags=["documents"])


@router.post("", response_model=DocumentIngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_document(
    payload: DocumentIngestRequest,
    settings: Settings = Depends(get_settings_dep),
) -> DocumentIngestResponse:
    result = enqueue_ingest_document(
        settings=settings,
        text=payload.text,
        source=payload.source,
        document_id=payload.document_id,
        metadata=payload.metadata,
        allowed_principals=payload.allowed_principals,
    )
    return DocumentIngestResponse(**result)


@router.post("/upload", response_model=DocumentIngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(...),
    metadata: str = Form("{}"),
    source: str | None = Form(None),
    document_id: str | None = Form(None),
    allowed_principals: str | None = Form(None),
    settings: Settings = Depends(get_settings_dep),
) -> DocumentIngestResponse:
    raw_bytes = await file.read()
    try:
        text = extract_text_from_upload(raw_bytes, file.filename, file.content_type)
    except UnsupportedFileTypeError as exc:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)) from exc
    except DocumentProcessingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        metadata_dict = json.loads(metadata) if metadata else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid metadata JSON") from exc

    if file.filename and "filename" not in metadata_dict:
        metadata_dict["filename"] = file.filename

    principals: List[str] = []
    if allowed_principals:
        try:
            parsed = json.loads(allowed_principals)
            if isinstance(parsed, list) and all(isinstance(item, str) for item in parsed):
                principals = parsed
            else:
                raise ValueError
        except (json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid allowed_principals payload") from exc

    if document_id is None:
        document_id = str(uuid.uuid4())

    result = enqueue_ingest_document(
        settings=settings,
        text=text,
        source=source,
        document_id=document_id,
        metadata=metadata_dict,
        allowed_principals=principals,
    )
    return DocumentIngestResponse(**result)


@router.get("/status/{task_id}", response_model=DocumentIngestStatusResponse)
async def get_document_status(task_id: str) -> DocumentIngestStatusResponse:
    celery_app = get_celery_app()
    async_result = celery_app.AsyncResult(task_id)

    state = async_result.state or states.PENDING
    info = async_result.info

    document_id: str | None = None
    stage: str | None = None
    detail: str | None = None

    if isinstance(info, dict):
        document_id = info.get("document_id")
        stage = info.get("stage")
        detail = info.get("detail")
    elif isinstance(info, Exception):  # pragma: no cover - defensive
        detail = str(info)
    elif info is not None:
        detail = str(info)

    if state == states.FAILURE and detail is None:
        detail = "Ingestion task failed."

    return DocumentIngestStatusResponse(
        task_id=task_id,
        state=state,
        stage=stage,
        document_id=document_id,
        detail=detail,
    )
