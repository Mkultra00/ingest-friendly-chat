"""Stage 1 — deterministic PDF ingest. No model calls.

Reproduces, from the raw PDFs alone, what the offline uccs data pack handed
us for free: per-page text, word spans with normalized bboxes, and tables.
The grading sandbox only ever sees $DATASET_DIR, so this stage is the whole
input surface for everything downstream.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any

import fitz  # PyMuPDF

TEXT_DENSITY_FLOOR = int(os.environ.get("TEXT_DENSITY_FLOOR", "40"))  # words/page
RENDER_DPI = int(os.environ.get("RENDER_DPI", "150"))


@dataclass
class Span:
    text: str
    bbox: tuple[float, float, float, float]  # normalized 0-1, origin top-left


@dataclass
class Table:
    name: str
    rows: list[list[str]]
    bbox: tuple[float, float, float, float] | None = None

    def to_markdown(self, max_rows: int = 120) -> str:
        rows = self.rows[:max_rows]
        if not rows:
            return ""
        width = max(len(r) for r in rows)
        out = [f"### TABLE: {self.name}"]
        for i, r in enumerate(rows):
            cells = [c.replace("|", "/").strip() for c in (r + [""] * (width - len(r)))]
            out.append("| " + " | ".join(cells) + " |")
            if i == 0:
                out.append("|" + "---|" * width)
        if len(self.rows) > max_rows:
            out.append(f"_({len(self.rows) - max_rows} more rows omitted)_")
        return "\n".join(out)


@dataclass
class Page:
    document: str
    number: int  # 1-based
    width: float
    height: float
    text: str = ""
    spans: list[Span] = field(default_factory=list)
    tables: list[Table] = field(default_factory=list)
    sheet_number: str | None = None
    sheet_title: str | None = None

    @property
    def word_count(self) -> int:
        return len(re.findall(r"\S+", self.text))

    @property
    def needs_vision(self) -> bool:
        return self.word_count < TEXT_DENSITY_FLOOR

    def prompt_body(self, char_budget: int = 60000) -> str:
        parts = [f"## {self.document} — page {self.number}"]
        if self.sheet_number or self.sheet_title:
            parts.append(f"Sheet: {self.sheet_number or '?'} — {self.sheet_title or ''}")
        parts.append(self.text.strip())
        for t in self.tables:
            md = t.to_markdown()
            if md:
                parts.append(md)
        body = "\n\n".join(p for p in parts if p)
        return body[:char_budget]

    def render_png(self, doc: "fitz.Document") -> bytes:
        page = doc[self.number - 1]
        pix = page.get_pixmap(dpi=RENDER_DPI)
        return pix.tobytes("png")


def list_documents(dataset_dir: str) -> list[str]:
    """Enumerate the dataset. Never hardcode file names."""
    names = []
    for name in sorted(os.listdir(dataset_dir)):
        path = os.path.join(dataset_dir, name)
        if not os.path.isfile(path):
            continue
        if name.startswith("."):
            continue
        if name.lower() in (
            "manifest.json",
            "files.json",
            "readme.md",
            "output.json",
            "debug.json",
        ):
            continue  # answer key / metadata, never present in the real set
        names.append(name)
    return names


def ingest_document(dataset_dir: str, name: str) -> tuple[list[Page], Any]:
    path = os.path.join(dataset_dir, name)
    if not name.lower().endswith(".pdf"):
        return _ingest_plain(path, name), None

    doc = fitz.open(path)
    pages: list[Page] = []
    for i, fpage in enumerate(doc, start=1):
        rect = fpage.rect
        page = Page(
            document=name,
            number=i,
            width=rect.width,
            height=rect.height,
            text=fpage.get_text("text") or "",
        )
        page.spans = _spans(fpage, rect.width, rect.height)
        page.tables = _tables(fpage, rect.width, rect.height)
        page.sheet_number, page.sheet_title = _title_block(page)
        pages.append(page)
    return pages, doc


def _ingest_plain(path: str, name: str) -> list[Page]:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError:
        return []
    return [Page(document=name, number=1, width=612, height=792, text=text)]


def _spans(fpage: Any, w: float, h: float) -> list[Span]:
    out: list[Span] = []
    if w <= 0 or h <= 0:
        return out
    for x0, y0, x1, y1, word, *_ in fpage.get_text("words"):
        out.append(Span(word, (x0 / w, y0 / h, x1 / w, y1 / h)))
    return out


def _tables(fpage: Any, w: float, h: float) -> list[Table]:
    """PyMuPDF table finder, with a name pulled from the text above the table."""
    tables: list[Table] = []
    try:
        found = fpage.find_tables()
    except Exception:  # noqa: BLE001 - table finder is best-effort
        return tables

    for idx, t in enumerate(getattr(found, "tables", []) or [], start=1):
        try:
            raw = t.extract()
        except Exception:  # noqa: BLE001
            continue
        rows = [[(c or "").strip() for c in row] for row in raw]
        rows = [r for r in rows if any(c for c in r)]
        if not rows:
            continue
        bbox = None
        name = f"Table_{idx}"
        try:
            x0, y0, x1, y1 = t.bbox
            bbox = (x0 / w, y0 / h, x1 / w, y1 / h)
            name = _table_caption(fpage, (x0, y0, x1, y1)) or name
        except Exception:  # noqa: BLE001
            pass
        tables.append(Table(name=name, rows=rows, bbox=bbox))
    return tables


def _table_caption(fpage: Any, bbox: tuple[float, float, float, float]) -> str | None:
    """Nearest ALL-CAPS / title-ish line in the 60pt band above the table."""
    x0, y0, x1, _ = bbox
    band = fitz.Rect(x0 - 10, max(0, y0 - 60), x1 + 10, y0 - 1)
    try:
        text = fpage.get_textbox(band) or ""
    except Exception:  # noqa: BLE001
        return None
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in reversed(lines):
        if re.search(r"(SCHEDULE|TABLE|NOTES|LEGEND|KEYNOTE|CALCULATION)", ln, re.I):
            return re.sub(r"\s+", " ", ln)[:80]
    return re.sub(r"\s+", " ", lines[-1])[:80] if lines else None


_SHEET_RE = re.compile(r"\b([A-Z]{1,2}[- ]?\d{3}(?:\.\d+)?)\b")


def _title_block(page: Page) -> tuple[str | None, str | None]:
    """Sheet number + title, read from the lower-right title block region."""
    candidates = [
        s.text for s in page.spans if s.bbox[0] > 0.65 and s.bbox[1] > 0.7
    ]
    joined = " ".join(candidates)
    m = _SHEET_RE.search(joined)
    number = m.group(1).replace(" ", "-") if m else None

    title = None
    for line in page.text.splitlines():
        ln = line.strip()
        if 6 <= len(ln) <= 60 and ln.isupper() and not _SHEET_RE.search(ln):
            title = ln
            break
    return number, title


def ingest_all(dataset_dir: str) -> tuple[list[Page], dict[str, Any]]:
    pages: list[Page] = []
    docs: dict[str, Any] = {}
    for name in list_documents(dataset_dir):
        try:
            p, doc = ingest_document(dataset_dir, name)
        except Exception as exc:  # noqa: BLE001 - one bad file must not kill the run
            print(f"[ingest] {name}: {exc}")
            continue
        pages.extend(p)
        if doc is not None:
            docs[name] = doc
        vision = sum(1 for x in p if x.needs_vision)
        tables = sum(len(x.tables) for x in p)
        print(
            f"[ingest] {name}: {len(p)} pages, {tables} tables, "
            f"{vision} need vision"
        )
    return pages, docs
