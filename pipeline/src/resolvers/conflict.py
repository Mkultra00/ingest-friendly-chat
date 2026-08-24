"""cross-document-conflict — same mark, same attribute, different value,
different documents.

The scored decision here is WHICH side is wrong. `document` must name the
file holding the incorrect value. Precedence, strongest authority first:
code reference > spec section > schedule > drawing annotation. The weaker
document carries the error.
"""

from __future__ import annotations

from collections import defaultdict

from facts import Fact, fmt_num
from resolvers import Finding
from tools_norm import norm_doc

# Higher wins. Requirements always outrank scheduled values.
SOURCE_AUTHORITY = {
    "body": 4,        # spec paragraph prose
    "note": 3,
    "keynote": 3,
    "schedule": 2,
    "table": 2,
    "callout": 1,
    "titleblock": 0,
    None: 1,
}

REL_TOLERANCE = 0.005  # 0.5% — guards against transcription rounding


def _authority(f: Fact) -> int:
    base = SOURCE_AUTHORITY.get(f.source, 1)
    if f.requirement:
        base += 5
    return base


def _doc_authority(document: str) -> int:
    """Filename heuristics: a spec beats a schedule beats a drawing."""
    d = norm_doc(document)
    if "spec" in d:
        return 3
    if "schedule" in d:
        return 1
    if "drawing" in d or "plan" in d or "sheet" in d:
        return 0
    return 2


def find_conflicts(facts: list[Fact]) -> list[Finding]:
    groups: dict[tuple[str, str], list[Fact]] = defaultdict(list)
    for f in facts:
        if not f.mark_key or f.canon_value is None or not f.attribute:
            continue
        groups[f.key].append(f)

    findings: list[Finding] = []
    for (mark_key, attribute), group in groups.items():
        # Only cross-DOCUMENT disagreements are this category.
        by_doc: dict[str, list[Fact]] = defaultdict(list)
        for f in group:
            by_doc[norm_doc(f.document)].append(f)
        if len(by_doc) < 2:
            continue

        # Compare the most authoritative fact per document, pairwise.
        reps = [max(v, key=_authority) for v in by_doc.values()]
        for i in range(len(reps)):
            for j in range(i + 1, len(reps)):
                a, b = reps[i], reps[j]
                if a.canon_unit and b.canon_unit and a.canon_unit != b.canon_unit:
                    continue  # different dimension: units.py territory
                if _same(a.canon_value, b.canon_value):
                    continue

                right, wrong = _order(a, b)
                conf = _confidence(right, wrong)
                findings.append(
                    Finding(
                        document=wrong.document,
                        category="cross-document-conflict",
                        mark=wrong.mark or mark_key,
                        attribute=attribute,
                        page=wrong.page,
                        container=wrong.container,
                        wrong_raw=wrong.display(),
                        wrong_canon=wrong.canon_display(),
                        correct_raw=right.display(),
                        correct_canon=right.canon_display(),
                        citation=right.citation or _doc_ref(right),
                        confidence=conf,
                        rule_id="conflict",
                        evidence=[x for x in (wrong.verbatim, right.verbatim) if x],
                        counterpart_document=right.document,
                        counterpart_page=right.page,
                        note=(
                            f"{right.document} p{right.page} states "
                            f"{right.display()}"
                        ),
                    )
                )
    return findings


def _same(a: float | None, b: float | None) -> bool:
    if a is None or b is None:
        return True
    scale = max(abs(a), abs(b), 1e-9)
    return abs(a - b) / scale <= REL_TOLERANCE


def _order(a: Fact, b: Fact) -> tuple[Fact, Fact]:
    """Return (authoritative, wrong)."""
    ka, kb = _authority(a), _authority(b)
    if ka != kb:
        return (a, b) if ka > kb else (b, a)
    da, db = _doc_authority(a.document), _doc_authority(b.document)
    if da != db:
        return (a, b) if da > db else (b, a)
    # Stable fallback: the later document in sort order carries the error, so
    # two runs never disagree.
    return (a, b) if a.document <= b.document else (b, a)


def _doc_ref(f: Fact) -> str:
    return f"{f.document} page {f.page}"


def _confidence(right: Fact, wrong: Fact) -> float:
    conf = 0.62
    if right.requirement:
        conf += 0.12
    if _authority(right) - _authority(wrong) >= 2:
        conf += 0.06
    if right.container and wrong.container:
        conf += 0.05
    if not (right.verbatim and wrong.verbatim):
        conf -= 0.15
    if right.canon_value and wrong.canon_value:
        ratio = max(right.canon_value, wrong.canon_value) / max(
            min(abs(right.canon_value), abs(wrong.canon_value)), 1e-9
        )
        if ratio > 100:
            conf -= 0.1  # implausible gap: more likely a units/transcription slip
    conf = min(conf, (right.confidence + wrong.confidence) / 2 + 0.25)
    return max(0.05, min(0.97, conf))


def describe_ratio(a: float, b: float) -> str:
    return fmt_num(max(a, b) / max(min(a, b), 1e-9))
