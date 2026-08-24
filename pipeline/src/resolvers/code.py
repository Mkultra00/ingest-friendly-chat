"""code-violation — a scheduled value violates a threshold.

Two sources of a threshold:
  1. rules.py — hardcoded code/spec requirements with citations.
  2. A requirement fact extracted from the documents themselves (a spec
     paragraph or general note), which is stronger evidence because we can
     quote its own section number.
"""

from __future__ import annotations

import re

from facts import Fact, fmt_num
from resolvers import Finding, context_text
from rules import CODE_RULES, CodeRule


def find_code_violations(facts: list[Fact]) -> list[Finding]:
    scheduled = [
        f
        for f in facts
        if not f.requirement and f.canon_value is not None and f.attribute
    ]
    requirements = [f for f in facts if f.requirement and f.canon_value is not None]

    findings: list[Finding] = []
    seen: set[tuple[str, str, str]] = set()

    # 1. Requirements stated in the documents.
    for req in requirements:
        for f in scheduled:
            if f.attribute != req.attribute:
                continue
            if not _scope_matches(req, f):
                continue
            if not _violates(req, f):
                continue
            k = (f.document, f.mark_key, f.attribute or "")
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
                    correct_raw=req.display(),
                    correct_canon=req.canon_display(),
                    citation=req.citation or f"{req.document} page {req.page}",
                    confidence=_conf_doc_rule(req, f),
                    rule_id=f"doc-req:{req.attribute}",
                    evidence=[x for x in (f.verbatim, req.verbatim) if x],
                    counterpart_document=req.document,
                    counterpart_page=req.page,
                    note=(
                        f"requirement from {req.document} p{req.page}"
                        + (f" ({req.applies_to})" if req.applies_to else "")
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
            if not rule.applies(f.mark or "", context_text(f)):
                continue
            if f.canon_value is None or not rule.violated(f.canon_value):
                continue
            k = (f.document, f.mark_key, f.attribute or "")
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


def _scope_matches(req: Fact, f: Fact) -> bool:
    """Does a document-stated requirement govern this scheduled fact?"""
    if req.mark_key and req.mark_key == f.mark_key:
        return True
    scope = (req.applies_to or "").strip()
    if not scope:
        return False
    hay = context_text(f).lower()
    words = [w for w in re.split(r"[^a-z0-9]+", scope.lower()) if len(w) > 3]
    if not words:
        return False
    # Require a scope word to appear in the fact's own context, so a
    # mechanical-room rule never fires on an office door.
    return any(w.rstrip("s") in hay for w in words)


def _violates(req: Fact, f: Fact) -> bool:
    if req.canon_value is None or f.canon_value is None:
        return False
    if req.canon_unit and f.canon_unit and req.canon_unit != f.canon_unit:
        return False
    text = f"{req.verbatim or ''} {req.value_raw or ''}".lower()
    maximum = any(w in text for w in ("maximum", "max", "not exceed", "no more than", "up to"))
    minimum = any(w in text for w in ("minimum", "min", "at least", "not less"))
    if maximum and not minimum:
        return f.canon_value > req.canon_value * 1.005
    if minimum and not maximum:
        return f.canon_value < req.canon_value * 0.995
    # Unqualified requirement ("provide 90-minute doors"): treat as a floor
    # for ratings and a ceiling for flows, which is how these read in practice.
    if f.attribute in ("fire_rating", "stc", "r_value", "thickness"):
        return f.canon_value < req.canon_value * 0.995
    return f.canon_value > req.canon_value * 1.005


def _conf_doc_rule(req: Fact, f: Fact) -> float:
    conf = 0.72
    if req.citation:
        conf += 0.08
    if req.mark_key and req.mark_key == f.mark_key:
        conf += 0.08
    if not f.verbatim:
        conf -= 0.15
    conf = min(conf, (req.confidence + f.confidence) / 2 + 0.3)
    return max(0.05, min(0.97, conf))


def _conf_hard_rule(rule: CodeRule, f: Fact) -> float:
    conf = 0.6
    if f.canon_unit == rule.unit:
        conf += 0.08
    if f.unit_raw:
        conf += 0.05  # the document stated a unit, so the comparison is sound
    if rule.kind and f.kind == rule.kind:
        conf += 0.05
    if not f.verbatim:
        conf -= 0.15
    conf = min(conf, f.confidence + 0.25)
    return max(0.05, min(0.95, conf))
