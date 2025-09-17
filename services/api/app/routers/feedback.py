from fastapi import APIRouter, Depends, HTTPException, status

from rag_shared import Settings

from ..dependencies import get_settings_dep
from ..models import FeedbackRequest, FeedbackResponse
from ..services.persistence import record_feedback

router = APIRouter(prefix="/v1/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_202_ACCEPTED)
async def submit_feedback(
    payload: FeedbackRequest,
    settings: Settings = Depends(get_settings_dep),  # noqa: ARG001
) -> FeedbackResponse:
    try:
        feedback_id = await record_feedback(
            message_id=payload.message_id,
            rating=payload.rating,
            comment=payload.comment,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="message not found") from exc

    return FeedbackResponse(feedback_id=feedback_id, message_id=payload.message_id)
