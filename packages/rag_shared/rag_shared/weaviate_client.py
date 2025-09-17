"""Weavnet/Weaviate client helpers."""
from typing import Optional

import weaviate

from .config import get_settings


_client: Optional[weaviate.Client] = None


def get_weaviate_client() -> weaviate.Client:
    """Return a singleton Weavnet client."""

    global _client
    if _client is not None:
        return _client

    settings = get_settings()
    auth = None
    if settings.weaviate_api_key:
        auth = weaviate.AuthApiKey(api_key=settings.weaviate_api_key)

    _client = weaviate.Client(
        url=settings.weaviate_url,
        auth_client_secret=auth,
        timeout_config=(5, 60),
    )
    return _client
