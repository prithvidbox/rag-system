from functools import lru_cache

from fastapi import Depends

from rag_shared import Settings, configure_logging, get_settings, get_weaviate_client


@lru_cache(maxsize=1)
def init_logging() -> None:
    settings = get_settings()
    configure_logging(f"api::{settings.env}")


async def get_settings_dep() -> Settings:
    init_logging()
    return get_settings()


def get_weaviate_dep(settings: Settings = Depends(get_settings_dep)):
    client = get_weaviate_client()
    return client
