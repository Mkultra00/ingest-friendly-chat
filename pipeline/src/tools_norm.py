"""Normalizers that mirror the grader's src/grade.ts exactly.

Used both by the emitter (dedupe keys) and by the local harness, so our
notion of "the same finding" is the grader's notion.
"""

from __future__ import annotations

import re


def norm_doc(name: str | None) -> str:
    if not name:
        return ""
    base = re.split(r"[\\/]", name.strip().lower())[-1]
    return re.sub(r"\.(pdf|md|txt|csv|json|png|jpg)$", "", base, flags=re.I)


def norm_category(cat: str | None) -> str:
    c = (cat or "").strip().lower()
    c = re.sub(r"[^a-z0-9]+", "-", c)
    return c.strip("-")


def fold(text: str) -> str:
    t = text.lower()
    t = re.sub(r"[\u2018\u2019\u2032]", "'", t)
    t = re.sub(r"[\u201c\u201d\u2033]", '"', t)
    return re.sub(r"[^a-z0-9'\"]+", "", t)
