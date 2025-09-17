"""Logging helpers."""
import logging
import os


def configure_logging(service_name: str) -> None:
    """Configure structured logging for a service."""

    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=level,
        format=f"%(asctime)s | {service_name} | %(levelname)s | %(name)s | %(message)s",
    )
