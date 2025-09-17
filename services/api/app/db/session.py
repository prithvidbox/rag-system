from __future__ import annotations

from tortoise import Tortoise

from rag_shared import Settings


async def init_db(settings: Settings) -> None:
    db_url = _normalize_dsn(settings.postgres_dsn)
    await Tortoise.init(
        db_url=db_url,
        modules={"models": ["app.db.models"]},
    )
    await Tortoise.generate_schemas()


async def close_db() -> None:
    await Tortoise.close_connections()


def _normalize_dsn(dsn: str) -> str:
    if dsn.startswith("postgresql+asyncpg://"):
        return dsn.replace("postgresql+asyncpg://", "postgres://", 1)
    if dsn.startswith("postgresql://"):
        return dsn
    return dsn
