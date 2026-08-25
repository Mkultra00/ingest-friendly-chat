"""missing-item — something required is absent.

Two shapes:
  A. A mark is referenced (callout, keynote, plan tag) but has no row in any
     schedule anywhere in the set.
  B. A schedule row exists but a required attribute cell is blank.

Both are precision-risky, so the bar is deliberately high: a mark must be
referenced at least twice (a single stray tag is usually an extraction slip),
and blanks only count for attributes in REQUIRED_ATTRIBUTES_BY_KIND.
"""

from __future__ import annotations

import re
from collections import defaultdict

from facts import Fact
from resolvers import Finding, mark_contexts
from resolvers.code import scope_matches
from rules import REQUIRED_ATTRIBUTES_BY_KIND

SCHEDULE_SOURCES = {"schedule", "table"}
REFERENCE_SOURCES = {"callout", "keynote", "note", "body"}

#: Only items that belong in a schedule can be "missing from the schedule".
#: Sheet numbers, room numbers, grid lines, circuits and detail bubbles are
#: referenced constantly and are never scheduled, so they are not defects.
NON_SCHEDULEABLE_KINDS = {
    "",
    "room",
    "sheet",
    "grid",
    "detail",
    "section",
    "elevation",
    "note",
    "keynote",
    "callout",
    "circuit",
    "other",
    "pipe",
    "assembly",
}

#: Sheet identifiers (A101, S102A, P207) — reference tokens, not schedule marks.
SHEET_LIKE = re.compile(r"^[A-Z]{1,2}\d{3}[A-Z]?$")



def find_missing(facts: list[Fact]) -> list[Finding]:
    findings: list[Finding] = []

    scheduled_marks: set[str] = {
        f.mark_key
        for f in facts
        if f.mark_key and f.source in SCHEDULE_SOURCES and f.value_raw
    }

    # --- A. referenced but never scheduled -------------------------------
    refs: dict[str, list[Fact]] = defaultdict(list)
    for f in facts:
        if f.mark_key and f.source in REFERENCE_SOURCES and not f.requirement:
            refs[f.mark_key].append(f)

    for mark_key, group in refs.items():
        if mark_key in scheduled_marks:
            continue
        if len(group) < 2:
            continue  # single reference: too likely an extraction artifact
        rep = group[0]
        kinds = {f.kind for f in group if f.kind}
        real_kinds = {(k or "").lower() for k in kinds} - NON_SCHEDULEABLE_KINDS
        if not real_kinds:
            continue  # rooms, sheets, grids and keynotes are not schedule rows

        if SHEET_LIKE.match((rep.mark or mark_key).upper().replace(" ", "")):
            continue
        # There must actually be a schedule of that kind in the set, otherwise
        # "absent from the schedule" is a statement about a missing document.
        if not any(
            (x.kind or "").lower() in real_kinds and x.source in SCHEDULE_SOURCES
            for x in facts
        ):

            continue

        findings.append(
            Finding(
                document=rep.document,
                category="missing-item",
                mark=rep.mark or mark_key,
                attribute=rep.attribute or "schedule_row",
                page=rep.page,
                container=rep.container,
                wrong_raw="no schedule row",
                wrong_canon="",
                correct_raw=f"a scheduled row for {rep.mark or mark_key}",
                correct_canon="",
                citation=None,
                confidence=0.5 + min(0.12, 0.03 * len(group)),
                rule_id="unscheduled-mark",
                evidence=[f.verbatim for f in group if f.verbatim][:3],
                note=(
                    f"{rep.mark or mark_key} is referenced {len(group)} times"
                    + (f" as {'/'.join(sorted(kinds))}" if kinds else "")
                    + " but appears in no schedule in the set"
                ),
            )
        )

    # --- B. blank required cell ------------------------------------------
    # A blank cell is only a defect when something in the set actually demands
    # a value for THAT item. Plenty of blanks are correct: an unrated aluminum
    # entry door has no fire rating, a mop basin has no fixture flow. Firing on
    # every blank costs more precision than the recall is worth.
    contexts = mark_contexts(facts)
    requirements = [f for f in facts if f.requirement and f.attribute]

    for f in facts:
        if f.requirement or f.value_raw or f.value_num is not None:
            continue
        if f.source not in SCHEDULE_SOURCES or not f.mark_key:
            continue
        required = REQUIRED_ATTRIBUTES_BY_KIND.get(f.kind or "", [])
        if f.attribute not in required:
            continue
        governing = _governing_requirement(f, requirements, contexts)
        if governing is None:
            continue

        findings.append(
            Finding(
                document=f.document,
                category="missing-item",
                mark=f.mark or f.mark_key,
                attribute=f.attribute or "",
                page=f.page,
                container=f.container,
                wrong_raw="blank",
                wrong_canon="",
                correct_raw=governing.display()
                or f"a stated {(f.attribute or '').replace('_', ' ')} value",
                correct_canon=governing.canon_display(),
                citation=governing.citation
                or f"{governing.document} page {governing.page}",
                confidence=0.58,
                rule_id="blank-required-cell",
                evidence=[x for x in (f.verbatim, governing.verbatim) if x],
                counterpart_document=governing.document,
                counterpart_page=governing.page,
                note=(
                    f"{f.container or 'schedule'} row {f.mark or f.mark_key} "
                    f"leaves {(f.attribute or '').replace('_', ' ')} blank while "
                    f"{governing.document} p{governing.page} requires "
                    f"{governing.display()}"
                    + (f" for {governing.applies_to}" if governing.applies_to else "")
                ),
            )
        )

    return findings


def _governing_requirement(
    f: Fact, requirements: list[Fact], contexts: dict[str, str]
) -> Fact | None:
    """The requirement that makes this blank a defect, or None."""
    for req in requirements:
        if req.attribute != f.attribute:
            continue
        if scope_matches(req, f, contexts):
            return req
    return None

