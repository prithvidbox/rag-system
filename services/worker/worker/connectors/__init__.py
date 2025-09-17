"""Connector registry for external knowledge bases."""

from .sharepoint import SharePointConnector

__all__ = [
    "SharePointConnector",
]
