"""File-system watcher that enqueues ingestion tasks on new files."""
from __future__ import annotations

import logging
import time
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from rag_shared import configure_logging

from .tasks import INBOX_PATH, PROCESSED_PATH, ensure_ingestion_paths, ingest_document

logger = logging.getLogger(__name__)
configure_logging("watcher")


class InboxEventHandler(FileSystemEventHandler):
    def __init__(self) -> None:
        super().__init__()
        ensure_ingestion_paths()

    def on_created(self, event) -> None:  # type: ignore[override]
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix.lower() != ".txt":
            logger.debug("Ignoring non-text file", extra={"path": str(path)})
            return
        logger.info("Detected new file", extra={"path": str(path)})
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            logger.warning("Skipping non-UTF8 file", extra={"path": str(path)})
            return

        metadata = {"filename": path.name}
        task = ingest_document.delay(
            document_id=path.stem,
            source="file_watch",
            text=text,
            metadata=metadata,
        )
        destination = PROCESSED_PATH / path.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        path.rename(destination)
        logger.info(
            "Queued ingestion for file",
            extra={"path": str(destination), "task_id": task.id},
        )


def main() -> None:
    ensure_ingestion_paths()
    observer = Observer()
    handler = InboxEventHandler()
    observer.schedule(handler, str(INBOX_PATH), recursive=False)
    observer.start()
    logger.info("Watching directory", extra={"path": str(INBOX_PATH)})
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down watcher")
    finally:
        observer.stop()
        observer.join()


if __name__ == "__main__":
    main()
