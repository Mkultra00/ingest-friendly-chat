"""Requirement-vs-scheduled-value resolver.

A scheduled value that breaks a stated requirement can legitimately be filed
under two categories, and the graded key is specific about which:

  * the requirement is written in ANOTHER document in the set
    -> `cross-document-conflict` (the two documents disagree)
  * the requirement comes from our hardcoded code table, with nothing in the
    set stating it -> `code-violation`
  * the two values differ by a clean unit/decimal factor (5.0 vs 0.5, 2 vs 1/4)
    -> `unit-error`, which outranks both, because that is what the defect IS

Category discipline matters more than finding count: under one-to-one matching
a miscategorised finding costs a true positive AND adds a false positive.
"""

from __future__ import annotations

import re

from facts import Fact, fmt_num
from resolvers import Finding, context_text, mark_contexts
from rules import CLEAN_FACTORS, CODE_RULES, CodeRule
from tools_norm import norm_doc

FACTOR_TOLERANCE = 0.12
STOPWORDS = {"room", "rooms", "the", "and", "all", "with", "per", "shall", "type", "types"}


def find_code_violations(facts: list[Fact]) -> list[Finding]:
    scheduled = [
        f
        for f in facts
        if not f.requirement and f.canon_value is not None and f.attribute
    ]
    requirements = [f for f in facts if f.requirement and f.canon_value is not None]
    contexts = mark_contexts(facts)

    findings: list[Finding] = []
    seen: set[tuple[str, str, str]] = set()

    # 1. Requirements stated somewhere in the document set.
    for req in requirements:
        for f in scheduled:
            if f.attribute != req.attribute:
                continue
            if not scope_matches(req, f, contexts):
                continue
            if not _violates(req, f):
                continue
            k = (norm_doc(f.document), f.mark_key, f.attribute or "")
            if k in seen:
                continue
            seen.add(k)

            category = _category(req, f)
            findings.append(
                Finding(
                    document=f.document,
                    category=category,
                    mark=f.mark or f.mark_key,
                    attribute=f.attribute or "",
                    page=f.page,
                    container=f.container,
                    wrong_raw=f.display(),
                    wrong_canon=f.canon_display(),
                    correct_raw=req.display(),
                    correct_canon=req.canon_display(),
                    citation=req.citation or f"{req.document} page {req.page}",
                    confidence=_conf_doc_rule(req, f, category),
                    rule_id=f"doc-req:{req.attribute}",
                    evidence=[x for x in (f.verbatim, req.verbatim) if x],
                    counterpart_document=req.document,
                    counterpart_page=req.page,
                    note=(
                        f"{req.document} p{req.page} requires {req.display()}"
                        + (f" for {req.applies_to}" if req.applies_to else "")
                    ),
                )
            )

    # 2. Hardcoded rules, for requirements the set never spells out.
    for rule in CODE_RULES:
        for f in scheduled:
            if f.attribute != rule.attribute:
                continue
            if rule.kind and f.kind and rule.kind != f.kind:
                continue
            hay = context_text(f) + " " + contexts.get(f.mark_key, "")
            if not rule.applies(f.mark or "", hay):
                continue
            if f.canon_value is None or not rule.violated(f.canon_value):
                continue
            k = (norm_doc(f.document), f.mark_key, f.attribute or "")
            if k in seen:
                continue
            seen.add(k)
            findings.append(
                Finding(
                    document=f.document,
                    category="code-violation",
                    mark=f.mark or f.mark_key,
                    attribute=f.attribute or "",
                    page=f.page,
                    container=f.container,
                    wrong_raw=f.display(),
                    wrong_canon=f.canon_display(),
                    correct_raw=f"{fmt_num(rule.limit)} {rule.unit}",
                    correct_canon=f"{fmt_num(rule.limit)} {rule.unit}",
                    citation=rule.citation,
                    confidence=_conf_hard_rule(rule, f),
                    rule_id=rule.id,
                    evidence=[x for x in (f.verbatim,) if x],
                    note=f"{rule.citation} requires {rule.requirement_text}",
                )
            )
    return findings


# ---------------------------------------------------------------------------
# scope
# ---------------------------------------------------------------------------


def scope_matches(req: Fact, f: Fact, contexts: dict[str, str]) -> bool:
    """Does a document-stated requirement govern this scheduled fact?"""
    if req.mark_key and req.mark_key == f.mark_key:
        return True
    scope = f"{req.applies_to or ''} {req.verbatim or ''}".strip()
    words = _scope_words(scope)
    if not words:
        return False
    # Search the whole schedule row, not just this cell: "mechanical rooms"
    # reaches door D-202 through its sibling "Mechanical 101" location cell.
    hay = (context_text(f) + " " + contexts.get(f.mark_key, "")).lower()
    return any(w in hay for w in words)


def _scope_words(scope: str) -> list[str]:
    out = []
    for w in re.split(r"[^a-z0-9]+", scope.lower()):
        if len(w) < 4 or w in STOPWORDS or w.isdigit():
            continue
        out.append(w.rstrip("s"))
    return out


# ---------------------------------------------------------------------------
# comparison
# ---------------------------------------------------------------------------


def _violates(req: Fact, f: Fact) -> bool:
    if req.canon_value is None or f.canon_value is None:
        return False
    if req.canon_unit and f.canon_unit and req.canon_unit != f.canon_unit:
        return False
    text = f"{req.verbatim or ''} {req.value_raw or ''} {req.applies_to or ''}".lower()
    maximum = any(
        w in text for w in ("maximum", "max", "not exceed", "no more than", "up to")
    )
    minimum = any(w in text for w in ("minimum", "min ", "at least", "not less"))
    if maximum and not minimum:
        return f.canon_value > req.canon_value * 1.005
    if minimum and not maximum:
        return f.canon_value < req.canon_value * 0.995
    # Unqualified requirement ("provide 90-minute doors"): a floor for ratings
    # and assemblies, a ceiling for flows, which is how these read in practice.
    if f.attribute in ("fire_rating", "stc", "r_value", "thickness"):
        return f.canon_value < req.canon_value * 0.995
    return abs(f.canon_value - req.canon_value) / max(abs(req.canon_value), 1e-9) > 0.005


def _clean_factor(a: float, b: float) -> float | None:
    hi, lo = max(abs(a), abs(b)), max(min(abs(a), abs(b)), 1e-9)
    ratio = hi / lo
    for factor in CLEAN_FACTORS:
        if abs(ratio - factor) / factor <= FACTOR_TOLERANCE:
            return factor
    return None


def _category(req: Fact, f: Fact) -> str:
    """Pick the single category that names the defect."""
    if _clean_factor(f.canon_value or 0, req.canon_value or 0) is not None:
        return "unit-error"
    if norm_doc(req.document) != norm_doc(f.document):
        return "cross-document-conflict"
    return "code-violation"


# ---------------------------------------------------------------------------
# confidence
# ---------------------------------------------------------------------------


def _conf_doc_rule(req: Fact, f: Fact, category: str) -> float:
    conf = 0.72
    if req.citation:
        conf += 0.08
    if req.mark_key and req.mark_key == f.mark_key:
        conf += 0.08
    if category == "unit-error":
        conf += 0.04  # a clean factor is the least ambiguous defect shape
    if not f.verbatim:
        conf -= 0.15
    conf = min(conf, (req.confidence + f.confidence) / 2 + 0.3)
    return max(0.05, min(0.97, conf))


def _conf_hard_rule(rule: CodeRule, f: Fact) -> float:
    conf = 0.6
    if f.canon_unit == rule.unit:
        conf += 0.08
    if f.unit_raw:
        conf += 0.05
    if rule.kind and f.kind == rule.kind:
        conf += 0.05
    if not f.verbatim:
        conf -= 0.15
    conf = min(conf, f.confidence + 0.25)
    return max(0.05, min(0.95, conf))
