import re
from dataclasses import dataclass
from io import BytesIO

from docx import Document
from pypdf import PdfReader

MAX_PDF_PAGES = 150


class ExtractionError(Exception):
    """Raised with a message that is safe to show to faculty."""


@dataclass
class ExtractedText:
    text: str
    page_count: int | None


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _pdf(data: bytes) -> ExtractedText:
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise ExtractionError(
                "This PDF is password-protected. Remove the password and upload it again."
            )
        pages = reader.pages
        if len(pages) > MAX_PDF_PAGES:
            raise ExtractionError(
                f"This PDF has more than {MAX_PDF_PAGES} pages. Upload the syllabus on its own."
            )
        text = "\n\n".join(page.extract_text() or "" for page in pages)
        # PDFs break lines at the page edge, so rejoin lines that continue a sentence.
        text = re.sub(r"(?<=[a-z,;])[ \t]*\n(?=[a-z(])", " ", text)
    except ExtractionError:
        raise
    except Exception as exc:
        raise ExtractionError("We couldn't open this PDF. It may be damaged.") from exc
    return ExtractedText(text=text, page_count=len(pages))


def _docx(data: bytes) -> ExtractedText:
    try:
        document = Document(BytesIO(data))
    except Exception as exc:
        raise ExtractionError("We couldn't open this Word document. It may be damaged.") from exc
    blocks = [p.text for p in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            blocks.append(" | ".join(dict.fromkeys(c for c in cells if c)))
    return ExtractedText(text="\n".join(blocks), page_count=None)


def _txt(data: bytes) -> ExtractedText:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return ExtractedText(text=data.decode(encoding), page_count=None)
        except UnicodeDecodeError:
            continue
    raise ExtractionError("We couldn't read this text file. Save it as UTF-8 and try again.")


EXTRACTORS = {".pdf": _pdf, ".docx": _docx, ".txt": _txt}


def extract_text(extension: str, data: bytes) -> ExtractedText:
    result = EXTRACTORS[extension](data)
    result.text = _normalize(result.text)
    if len(result.text.split()) < 20:
        raise ExtractionError(
            "We couldn't find readable text in this file. Scanned PDFs aren't supported "
            "yet, so please upload a Word document or a text-based PDF."
        )
    return result


COURSE_CODE = re.compile(r"^\s*([A-Z]{2,6})[\s-]?(\d{3,4}[A-Z]?)\b")


def guess_course_code(title: str) -> str:
    match = COURSE_CODE.match(title)
    return f"{match.group(1)} {match.group(2)}" if match else ""


def guess_title(text: str, fallback: str) -> str:
    for line in text.splitlines():
        line = line.strip(" \t-–:|")
        if 4 <= len(line) <= 120:
            return line
    return fallback
