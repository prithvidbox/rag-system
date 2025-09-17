from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Callable

from docx import Document as DocxDocument
from pypdf import PdfReader

TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".yaml",
    ".yml",
    ".log",
}

# Content types that are handled as plain text even if extension missing
TEXT_CONTENT_PREFIXES = (
    "text/",
    "application/json",
    "application/xml",
)


class UnsupportedFileTypeError(Exception):
    """Raised when the uploaded file type is not supported."""


class DocumentProcessingError(Exception):
    """Raised when the uploaded document cannot be processed."""


def _decode_text(raw: bytes) -> str:
    """Decode raw bytes to text, attempting a few sensible fallbacks."""

    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise DocumentProcessingError("Unable to decode text file as UTF-8 or Latin-1.")


def _extract_pdf(raw: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(raw))
    except Exception as exc:  # pypdf raises generic exceptions
        raise DocumentProcessingError("Unable to open PDF file.") from exc

    pages = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # pragma: no cover - defensive
            raise DocumentProcessingError("Unable to extract text from one of the PDF pages.") from exc
        pages.append(text.strip())

    combined = "\n\n".join(filter(None, pages)).strip()
    if not combined:
        raise DocumentProcessingError("The PDF did not contain any extractable text.")
    return combined


def _extract_docx(raw: bytes) -> str:
    try:
        document = DocxDocument(io.BytesIO(raw))
    except Exception as exc:
        raise DocumentProcessingError("Unable to open DOCX file.") from exc

    paragraphs = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
    if not paragraphs:
        raise DocumentProcessingError("The DOCX document did not contain any text paragraphs.")
    return "\n\n".join(paragraphs)


def _extract_csv(raw: bytes, delimiter: str = ",") -> str:
    text = _decode_text(raw)
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = ["\t".join(cell.strip() for cell in row) for row in reader]
    if not rows:
        raise DocumentProcessingError("The CSV file did not contain any rows.")
    return "\n".join(rows)


BINARY_HANDLERS: dict[str, Callable[[bytes], str]] = {
    ".pdf": _extract_pdf,
    ".docx": _extract_docx,
    ".csv": _extract_csv,
    ".tsv": lambda raw: _extract_csv(raw, delimiter="\t"),
}


def _guess_extension(filename: str | None) -> str:
    if not filename:
        return ""
    return Path(filename).suffix.lower()


def _is_text_file(extension: str, content_type: str | None) -> bool:
    if extension in TEXT_EXTENSIONS:
        return True
    if content_type:
        return any(content_type.startswith(prefix) for prefix in TEXT_CONTENT_PREFIXES)
    return False


def extract_text_from_upload(raw: bytes, filename: str | None, content_type: str | None) -> str:
    """Return plain text extracted from an uploaded file."""

    if not raw:
        raise DocumentProcessingError("Uploaded file was empty.")

    extension = _guess_extension(filename)

    if _is_text_file(extension, content_type):
        return _decode_text(raw)

    handler = BINARY_HANDLERS.get(extension)
    if handler:
        return handler(raw)

    raise UnsupportedFileTypeError(
        "Unsupported file type. Please upload one of: TXT, MD, CSV, TSV, JSON, PDF, or DOCX."
    )
