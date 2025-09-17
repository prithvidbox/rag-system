#!/usr/bin/env python3
"""Seed or validate the Weavnet schema."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_PATHS = [ROOT, ROOT / "packages" / "rag_shared", ROOT / "services" / "api"]
for path in PACKAGE_PATHS:
    if str(path) not in sys.path:
        sys.path.append(str(path))

from rag_shared import configure_logging  # noqa: E402
from rag_shared.config import get_settings  # noqa: E402
from services.api.app.infra.weaviate_schema import ensure_weavnet_schema  # noqa: E402


def main() -> None:
    configure_logging("seed-weavnet")
    settings = get_settings()
    ensure_weavnet_schema(settings)


if __name__ == "__main__":
    main()
