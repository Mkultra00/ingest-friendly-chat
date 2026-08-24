"""Stage 3 — deterministic finding resolvers.

Every resolver takes facts and returns Findings. No model calls happen here,
which is what makes a run reproducible: same facts in, same findings out.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from facts import Fact


@dataclass
class Finding:
    document: str            # the file holding the INCORRECT value
    category: str            # one of the four enum values
    mark: str
    attribute: str
    page: int
    container: str | None
    wrong_raw: str
    wrong_canon: str
    correct_raw: str
    correct_canon: str
    citation: str | None
    confidence: float
    rule_id: str
    evidence: list[str] = field(default_factory=list)
    counterpart_document: str | None = None
    counterpart_page: int | None = None
    note: str | None = None

    @property
    def dedupe_key(self) -> tuple[str, str, str, str]:
        from tools_norm import norm_doc  # noqa: PLC0415 - avoids a cycle

        return (norm_doc(self.document), self.category, self.mark.upper(), self.attribute)

    def to_dict(self) -> dict[str, Any]:
        return {
            "document": self.document,
            "category": self.category,
            "mark": self.mark,
            "attribute": self.attribute,
            "page": self.page,
            "container": self.container,
            "wrong_raw": self.wrong_raw,
            "wrong_canon": self.wrong_canon,
            "correct_raw": self.correct_raw,
            "correct_canon": self.correct_canon,
            "citation": self.citation,
            "confidence": round(self.confidence, 3),
            "rule_id": self.rule_id,
            "evidence": self.evidence,
            "counterpart_document": self.counterpart_document,
            "counterpart_page": self.counterpart_page,
            "note": self.note,
        }


def context_text(f: Fact) -> str:
    """Everything textual we know about a fact, for rule scope matching."""
    return " ".join(
        x for x in (f.mark, f.kind, f.container, f.verbatim, f.value_raw, f.applies_to) if x
    )


def mark_contexts(facts: list[Fact]) -> dict[str, str]:
    """Pool every fact that shares a mark into one searchable blob.

    A requirement scoped to "mechanical rooms" must reach door D-202, whose
    fire_rating fact says only "45 min" — the word "Mechanical 101" lives on
    the sibling `location` fact in the same schedule row.
    """
    from collections import defaultdict  # noqa: PLC0415

    bags: dict[str, list[str]] = defaultdict(list)
    for f in facts:
        if f.mark_key:
            bags[f.mark_key].append(context_text(f))
    return {k: " ".join(v).lower() for k, v in bags.items()}



from resolvers.code import find_code_violations  # noqa: E402
from resolvers.conflict import find_conflicts  # noqa: E402
from resolvers.missing import find_missing  # noqa: E402
from resolvers.units import find_unit_errors  # noqa: E402

__all__ = [
    "Finding",
    "context_text",
    "find_conflicts",
    "find_unit_errors",
    "find_code_violations",
    "find_missing",
]


def resolve_all(facts: list[Fact]) -> list[Finding]:
    findings: list[Finding] = []
    findings += find_conflicts(facts)
    findings += find_code_violations(facts)
    findings += find_unit_errors(facts)
    findings += find_missing(facts)
    return findings
