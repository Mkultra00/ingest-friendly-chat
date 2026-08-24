"""Stage 2 — LLM extraction. Facts only, never findings.

The model's whole job is to transcribe what a page says into typed rows.
Whether something is an error is decided later, in pure Python, so every
finding stays reproducible and citable.
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from facts import Fact, fact_from_dict
from ingest import Page
from llm import Chat

CONCURRENCY = int(os.environ.get("EXTRACT_CONCURRENCY", "8"))

SYSTEM = """You transcribe construction documents into structured facts.

You do NOT judge correctness. You do NOT report errors. You only record what
the page states, exactly as stated. Downstream code compares the facts.

Return ONLY a JSON object:

{"facts": [{
  "mark": "WH-1",
  "kind": "door|fixture|equipment|room|panel|pipe|finish|assembly|other",
  "attribute": "fire_rating|flow|capacity|slope|voltage|power|current|size|diameter|thickness|width|height|length|temperature|pressure|airflow|model|manufacturer",
  "value_raw": "50 GAL",
  "value_num": 50,
  "unit_raw": "GAL",
  "page": 3,
  "source": "table|schedule|note|keynote|callout|titleblock|body",
  "container": "PLUMBING FIXTURE SCHEDULE",
  "verbatim": "WH-1  ELECTRIC WATER HEATER  50 GAL",
  "requirement": false,
  "applies_to": "mechanical rooms",
  "citation": "08 11 00",
  "confidence": 0.9
}]}

Rules:
- One fact per (mark, attribute) value you can read. Emit every schedule row.
- "value_raw" and "verbatim" must be copied CHARACTER FOR CHARACTER from the
  page, including units and quote marks. They are quoted downstream as
  evidence, so an invented string breaks the finding.
- Set "requirement": true when the text states what SHOULD be (a spec
  paragraph, a code reference, a general note: "provide 90-minute rated
  doors at mechanical rooms"). Then put the governed scope in "applies_to"
  and the section or code number in "citation", and leave "mark" null unless
  the requirement names a specific mark.
- Set "requirement": false for scheduled/tagged values (what IS).
- Record a value even when a unit is missing. Never convert units yourself.
- "mark" is the tag exactly as printed: D-202, L-1, WH-1, S102, CG-1.
- If a schedule cell that should carry a value is blank or "-", emit the fact
  with "value_raw": null and "attribute" set. Blanks matter downstream.
- Every field may be null. Return {"facts": []} if the page has no facts.
- No prose, no markdown fence, no explanation. JSON object only."""

USER_TEMPLATE = """Transcribe every fact on this page.

{body}"""

VISION_NOTE = """This page's embedded text could not be extracted, so it is
attached as an image. Read the drawing and its schedules from the image.

{body}"""


def extract_page(chat: Chat, page: Page, doc: Any) -> list[Fact]:
    body = page.prompt_body()

    if page.needs_vision and doc is not None:
        try:
            png = page.render_png(doc)
        except Exception as exc:  # noqa: BLE001
            print(f"[extract] render failed {page.document} p{page.number}: {exc}")
            png = None
        if png is not None:
            data = chat.json_call(
                SYSTEM, VISION_NOTE.format(body=body or "(no extractable text)"), image_png=png
            )
            return _facts(data, page)

    if not body.strip():
        return []
    data = chat.json_call(SYSTEM, USER_TEMPLATE.format(body=body))
    return _facts(data, page)


def _facts(data: dict[str, Any], page: Page) -> list[Fact]:
    raw = data.get("facts")
    if not isinstance(raw, list):
        return []
    out: list[Fact] = []
    for item in raw:
        f = fact_from_dict(item, page.document, page.number)
        if f is None:
            continue
        if not f.container and page.tables:
            f.container = page.tables[0].name
        out.append(f)
    return out


def extract_all(chat: Chat, pages: list[Page], docs: dict[str, Any]) -> list[Fact]:
    results: list[list[Fact]] = [[] for _ in pages]

    def work(i: int) -> None:
        page = pages[i]
        try:
            results[i] = extract_page(chat, page, docs.get(page.document))
        except Exception as exc:  # noqa: BLE001 - one page must not kill the run
            print(f"[extract] {page.document} p{page.number}: {exc}")

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        list(pool.map(work, range(len(pages))))

    facts = [f for group in results for f in group]
    print(
        f"[extract] {len(facts)} facts from {len(pages)} pages "
        f"({chat.calls} model calls, {chat.failures} page failures)"
    )
    return facts
