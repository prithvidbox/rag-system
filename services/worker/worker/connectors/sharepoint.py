"""SharePoint (Microsoft Graph) connector for permission-aware ingestion."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable, List, Optional

import requests

from rag_shared import Settings, get_settings

logger = logging.getLogger(__name__)


@dataclass
class SharePointDocument:
    id: str
    site_id: str
    web_url: str
    title: str
    content: str
    last_modified: str
    allowed_principals: List[str]
    metadata: dict


class SharePointConnector:
    """Thin wrapper around Microsoft Graph for page/document sync."""

    GRAPH_BASE = "https://graph.microsoft.com/v1.0"

    def __init__(self, settings: Optional[Settings] = None, *, credentials: Optional[dict[str, str]] = None) -> None:
        self.settings = settings or get_settings()
        self.credentials = credentials or {}
        self._session = requests.Session()
        self._token: Optional[str] = None

    def _get_token(self) -> str:
        tenant_id = self.credentials.get("tenant_id") or self.settings.sharepoint_tenant_id
        client_id = self.credentials.get("client_id") or self.settings.sharepoint_client_id
        client_secret = self.credentials.get("client_secret") or self.settings.sharepoint_client_secret
        if not (client_id and client_secret and tenant_id):
            raise RuntimeError("SharePoint credentials not configured")
        if self._token:
            return self._token
        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        data = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }
        response = self._session.post(token_url, data=data, timeout=30)
        response.raise_for_status()
        self._token = response.json().get("access_token")
        if not self._token:
            raise RuntimeError("Could not obtain access token for SharePoint")
        return self._token

    def verify_connection(self) -> None:
        self._token = None
        self._get_token()

    def _request(self, method: str, url: str, **kwargs) -> dict:
        token = self._get_token()
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {token}"
        headers.setdefault("Accept", "application/json")
        response = self._session.request(method, url, headers=headers, timeout=30, **kwargs)
        if response.status_code == 401:
            # token expired – refresh once
            self._token = None
            token = self._get_token()
            headers["Authorization"] = f"Bearer {token}"
            response = self._session.request(method, url, headers=headers, timeout=30, **kwargs)
        response.raise_for_status()
        return response.json()

    def iter_site_pages(self, site_id: str) -> Iterable[SharePointDocument]:
        """Yield site pages (modern pages) with ACL metadata."""

        endpoint = f"{self.GRAPH_BASE}/sites/{site_id}/pages"
        params = {"$top": self.settings.sharepoint_sync_page_size}
        while endpoint:
            payload = self._request("GET", endpoint, params=params)
            for item in payload.get("value", []):
                page_id = item.get("id")
                if not page_id:
                    continue
                principals = self._extract_principals(item)
                content = item.get("content", {}).get("html", "")
                metadata = {
                    "source": "sharepoint",
                    "site_id": site_id,
                    "web_url": item.get("webUrl"),
                    "last_modified": item.get("lastModifiedDateTime"),
                    "title": item.get("title"),
                }
                yield SharePointDocument(
                    id=page_id,
                    site_id=site_id,
                    web_url=item.get("webUrl", ""),
                    title=item.get("title", ""),
                    content=content,
                    last_modified=item.get("lastModifiedDateTime", ""),
                    allowed_principals=principals,
                    metadata=metadata,
                )
            endpoint = payload.get("@odata.nextLink")
            params = None

    @staticmethod
    def _extract_principals(item: dict) -> List[str]:
        principals: List[str] = []
        site_id = item.get("sharePointIds", {}).get("siteId")
        if site_id:
            principals.append(f"site:{site_id}")
        for permission in item.get("permissions", []) or []:
            granted_to = permission.get("grantedToV2", {})
            if "user" in granted_to:
                user = granted_to["user"].get("id")
                if user:
                    principals.append(f"user:{user}")
            if "group" in granted_to:
                group = granted_to["group"].get("id")
                if group:
                    principals.append(f"group:{group}")
        return principals or ["sharepoint:public"]
