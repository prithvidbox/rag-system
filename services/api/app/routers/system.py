from fastapi import APIRouter

router = APIRouter(tags=["system"], prefix="/system")


@router.get("/health")
async def healthcheck() -> dict:
    return {"status": "ok"}
