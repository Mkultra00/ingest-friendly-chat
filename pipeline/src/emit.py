"""Stage 4 — emit output.json.

Everything the grader can see is decided here, so this file is where the
five hard rules from the spec live:

R1 Numbers or nothing — every description carries mark, wrong value, correct
   value, container, citation, and page number, because the grader anchors on
   digit-bearing tokens.
R2 Raw AND canonical — fold() equates "45 kVA"/"45kVA" but converts nothing,
   so quote the literal document string and the normalized one.
R3 `document` is the file with the INCORRECT value (decided in the resolvers).
R4 Category discipline — a wrong category loses a true positive twice over.
R5 One finding per (document, category, mark, attribute).
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from resolvers import Finding

CONFIDENCE_GATE = float(os.environ.get("CONFIDENCE_GATE", "0.55"))
MAX_FINDINGS = int(os.environ.get("MAX_FINDINGS", "150"))

VALID_CATEGORIES = {
    "cross-document-conflict",
    "code-violation",
    "unit-error",
    "missing-item",
}

ATTRIBUTE_WORDS = {
    "fire_rating": "fire rating",
    "flow": "flow rate",
    "capacity": "capacity",
    "slope": "slope",
    "voltage": "voltage",
    "power": "rating",
    "current": "ampacity",
    "size": "size",
    "diameter": "diameter",
    "thickness": "thickness",
    "width": "clear width",
    "height": "height",
    "temperature": "temperature",
    "pressure": "pressure",
    "airflow": "airflow",
    "schedule_row": "schedule row",
}


def location_of(f: Finding) -> str:
    bits = [f"page {f.page}"]
    if f.container:
        bits.append(f.container)
    if f.mark:
        bits.append(f.mark)
    return ", ".join(bits)


def description_of(f: Finding) -> str:
    word = ATTRIBUTE_WORDS.get(f.attribute, (f.attribute or "value").replace("_", " "))
    mark = f.mark or "the item"
    page = f.page
    where = f.container or "the schedule"

    wrong = _both(f.wrong_raw, f.wrong_canon)
    right = _both(f.correct_raw, f.correct_canon)

    if f.category == "missing-item":
        if f.rule_id == "unscheduled-mark":
            s = (
                f"{mark} is referenced on page {page} of {f.document} "
                f"but has no row in any schedule in the set; a scheduled "
                f"{word} entry for {mark} is missing."
            )
        else:
            s = (
                f"{mark} in {where} on page {page} leaves the {word} cell "
                f"blank; the schedule must state a {word} for {mark}."
            )
    elif f.category == "unit-error":
        s = (
            f"{mark} in {where} on page {page} lists a {word} of {wrong}, "
            f"which is off by a unit conversion; the value should read "
            f"{right}."
        )
    elif f.category == "code-violation":
        s = (
            f"{mark} in {where} on page {page} is given a {word} of {wrong}, "
            f"but {f.citation or 'the governing requirement'} requires "
            f"{right}."
        )
    else:  # cross-document-conflict
        s = (
            f"{mark} in {where} on page {page} lists a {word} of {wrong}, "
            f"which conflicts with {right} in "
            f"{f.counterpart_document or 'the other document'}"
            + (f" page {f.counterpart_page}" if f.counterpart_page else "")
            + "."
        )

    if f.citation and f.citation not in s:
        s += f" See {f.citation}."
    if f.note and f.note not in s:
        s += f" ({f.note})"
    return _tidy(s)


def _both(raw: str, canon: str) -> str:
    raw = (raw or "").strip()
    canon = (canon or "").strip()
    if not raw:
        return canon or "an unstated value"
    if not canon or _folds_same(raw, canon):
        return raw
    return f"{raw} ({canon})"


def _folds_same(a: str, b: str) -> bool:
    from tools_norm import fold  # noqa: PLC0415

    return fold(a) == fold(b)


def _tidy(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s[:900]


def dedupe(findings: list[Finding]) -> list[Finding]:
    """R5: highest-confidence finding wins per key. Duplicates only cost
    precision — they can never raise recall under one-to-one matching."""
    best: dict[tuple, Finding] = {}
    for f in findings:
        k = f.dedupe_key
        if k not in best or f.confidence > best[k].confidence:
            best[k] = f
    return list(best.values())


def select(findings: list[Finding]) -> list[Finding]:
    kept = [f for f in dedupe(findings) if f.category in VALID_CATEGORIES]
    kept = [f for f in kept if f.confidence >= CONFIDENCE_GATE]
    kept.sort(key=lambda f: (-f.confidence, f.document, f.page, f.mark))
    return kept[:MAX_FINDINGS]


def to_output(findings: list[Finding]) -> dict[str, Any]:
    errors = []
    for f in findings:
        errors.append(
            {
                "document": f.document,
                "category": f.category,
                "location": location_of(f),
                "description": description_of(f),
            }
        )
    return {"errors": errors}


def write_output(path: str, findings: list[Finding]) -> dict[str, Any]:
    payload = to_output(findings)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    return payload


def write_debug(path: str, findings: list[Finding], facts: list[Any]) -> None:
    """Sidecar for the review UI and for triaging false positives locally.
    Never read by the grader."""
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "findings": [f.to_dict() for f in findings],
                    "facts": [x.to_dict() for x in facts],
                },
                fh,
                indent=2,
            )
    except Exception as exc:  # noqa: BLE001 - debug output is never fatal
        print(f"[emit] debug write failed: {exc}")
