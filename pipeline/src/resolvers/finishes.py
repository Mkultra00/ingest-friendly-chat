"""Finish/material tag reconciliation across documents.

The drawings tag rooms with finish codes (CPT-6, P-1, CONC-1); the finishes
schedule defines them. Two defects fall out of comparing the two sets:

  * a code tagged on the drawings whose only counterpart in the schedule is a
    near-miss variant (CPT-07 vs CPT-7, FTL-1 vs FLT-1, CONC-1 vs CON-1)
    -> `cross-document-conflict`, blamed on the drawing that tagged it
  * a code tagged on the drawings with no counterpart at all
    -> `missing-item`

Composite tags ("CPT-4/6", "P-1/3") are split before matching, because a
drawing writes two codes in one cell all the time.
"""

from __future__ import annotations

import re
from collections import defaultdict

from facts import Fact
from resolvers import Finding
from tools_norm import norm_doc

#: Attributes whose value is itself a finish/material code.
FINISH_ATTRS = {
    "floor_finish",
    "base_finish",
    "wall_finish",
    "ceiling_finish",
    "finish",
    "finish_code",
    "tag",
}

#: A finish code: 1-4 letters, a separator, then digits (optionally a letter).
CODE = re.compile(r"^([A-Z]{1,4})[-\s]?(\d{1,3})([A-Z])?$")

SCHEDULE_SOURCES = {"schedule", "table"}

#: Codes that are really sheet or room identifiers, never finishes.
NOT_A_FINISH = re.compile(r"^[A-Z]{1,2}\d{3}[A-Z]?$")


def find_finish_conflicts(facts: list[Fact]) -> list[Finding]:
    defined = _defined_codes(facts)
    referenced = _referenced_codes(facts)
    if not defined or not referenced:
        return []

    findings: list[Finding] = []
    for (doc, code), group in sorted(referenced.items()):
        others = {
            d: codes for d, codes in defined.items() if norm_doc(d) != norm_doc(doc)
        }
        if not others:
            continue
        if any(code in codes for codes in others.values()):
            continue  # defined verbatim somewhere else: nothing to report

        variant = _near_miss(code, others)
        rep = group[0]
        page_ref = rep.page
        rooms = sorted({f.mark for f in group if f.mark})[:3]
        where = rep.container or "the finish plan"

        if variant is not None:
            other_doc, other_code, other_page = variant
            findings.append(
                Finding(
                    document=doc,
                    category="cross-document-conflict",
                    mark=code,
                    attribute="finish_code",
                    page=page_ref,
                    container=rep.container,
                    wrong_raw=code,
                    wrong_canon="",
                    correct_raw=other_code,
                    correct_canon="",
                    citation=None,
                    confidence=0.72,
                    rule_id="finish-tag-variant",
                    evidence=[x for x in (rep.verbatim,) if x],
                    counterpart_document=other_doc,
                    counterpart_page=other_page,
                    note=(
                        f"{doc} tags {code} in {where} on page {page_ref}"
                        + (f" (at {', '.join(rooms)})" if rooms else "")
                        + f", while {other_doc} page {other_page} defines {other_code}"
                    ),
                )
            )
            continue

        if len(group) < 2:
            continue  # a single tag is usually an extraction slip
        findings.append(
            Finding(
                document=doc,
                category="missing-item",
                mark=code,
                attribute="finish_code",
                page=page_ref,
                container=rep.container,
                wrong_raw=code,
                wrong_canon="",
                correct_raw="",
                correct_canon="",
                citation=None,
                confidence=0.6,
                rule_id="unscheduled-mark",
                evidence=[x for x in (rep.verbatim,) if x],
                note=(
                    f"{code} is tagged {len(group)} times on {doc} page {page_ref}"
                    + (f" (at {', '.join(rooms)})" if rooms else "")
                    + " but no finishes schedule row defines it"
                ),
            )
        )
    return findings


# ---------------------------------------------------------------------------


def _defined_codes(facts: list[Fact]) -> dict[str, dict[str, int]]:
    """document -> {code: page} for every code the document defines a row for."""
    out: dict[str, dict[str, int]] = defaultdict(dict)
    for f in facts:
        code = _clean(f.mark)
        if not code:
            continue
        if f.source not in SCHEDULE_SOURCES:
            continue
        out[f.document].setdefault(code, f.page)
    return dict(out)


def _referenced_codes(facts: list[Fact]) -> dict[tuple[str, str], list[Fact]]:
    out: dict[tuple[str, str], list[Fact]] = defaultdict(list)
    for f in facts:
        if (f.attribute or "") not in FINISH_ATTRS or f.requirement:
            continue
        for code in _split(f.value_raw):
            out[(f.document, code)].append(f)
    return dict(out)


def _split(value: str | None) -> list[str]:
    """'CPT-4/6' -> CPT-4, CPT-6.  'P-1, P-3' -> P-1, P-3."""
    if not value:
        return []
    parts = [p for p in re.split(r"[,;&]| and ", str(value)) if p.strip()]
    codes: list[str] = []
    for part in parts:
        chunk = part.strip().upper()
        if "/" in chunk:
            head, *tails = chunk.split("/")
            base = _clean(head)
            if base:
                codes.append(base)
                prefix = CODE.match(_dash(head.strip().upper())).group(1)  # type: ignore[union-attr]
                for t in tails:
                    t = t.strip()
                    codes.append(_clean(t if not t.isdigit() else f"{prefix}-{t}") or "")
            continue
        c = _clean(chunk)
        if c:
            codes.append(c)
    return [c for c in dict.fromkeys(codes) if c]


def _dash(s: str) -> str:
    return re.sub(r"\s+", "-", s.strip())


def _clean(raw: str | None) -> str:
    """Canonical display form of a finish code, or '' when it is not one."""
    if not raw:
        return ""
    s = re.sub(r"\s+", "", str(raw).upper())
    if NOT_A_FINISH.match(s):
        return ""
    m = CODE.match(s) or CODE.match(_dash(str(raw).upper()))
    if not m:
        return ""
    letters, digits, suffix = m.group(1), m.group(2), m.group(3) or ""
    return f"{letters}-{digits}{suffix}"


def _key(code: str) -> str:
    """Match key that ignores leading zeros: CPT-07 and CPT-7 collide."""
    m = CODE.match(re.sub(r"\s+", "", code))
    if not m:
        return code
    return f"{m.group(1)}{int(m.group(2))}{m.group(3) or ''}"


def _near_miss(
    code: str, others: dict[str, dict[str, int]]
) -> tuple[str, str, int] | None:
    """Find a schedule code that is plainly the same item under a different tag."""
    k = _key(code)
    m = CODE.match(re.sub(r"\s+", "", code))
    if not m:
        return None
    letters, digits, suffix = m.group(1), int(m.group(2)), m.group(3) or ""

    for doc, codes in others.items():
        for other, page in codes.items():
            ok = _key(other)
            om = CODE.match(re.sub(r"\s+", "", other))
            if not om:
                continue
            oletters, odigits, osuffix = om.group(1), int(om.group(2)), om.group(3) or ""
            if ok == k:
                return (doc, other, page)  # leading-zero mismatch only
            if digits != odigits or suffix != osuffix:
                continue
            if sorted(letters) == sorted(oletters) and letters != oletters:
                return (doc, other, page)  # transposed prefix: FTL-1 vs FLT-1
            if letters != oletters and (
                letters.startswith(oletters) or oletters.startswith(letters)
            ):
                return (doc, other, page)  # truncated prefix: CONC-1 vs CON-1
    return None
