"""unit-error — a value that is implausible for its attribute, especially
one off by a clean factor (the classic "slope off by 8x").

Two independent signals, and we require at least one strong one:
  A. the value falls outside the plausibility band for its attribute, AND the
     ratio to the nearest band edge is close to a clean unit-conversion factor;
  B. two facts for the same mark+attribute agree numerically but carry units
     from different dimensions (2" vs 2 ft).
"""

from __future__ import annotations

from collections import defaultdict

from facts import Fact, fmt_num
from resolvers import Finding
from rules import CLEAN_FACTORS, PLAUSIBLE
from tools_norm import norm_doc

FACTOR_TOLERANCE = 0.12  # 12% around a clean factor


def find_unit_errors(facts: list[Fact]) -> list[Finding]:
    findings: list[Finding] = []
    seen: set[tuple[str, str, str]] = set()

    for f in facts:
        if f.requirement or f.canon_value is None or not f.attribute:
            continue
        band = PLAUSIBLE.get(f.attribute)
        if not band:
            continue
        lo, hi = band
        v = f.canon_value
        if lo <= v <= hi:
            continue

        edge = lo if v < lo else hi
        ratio = max(v, edge) / max(min(abs(v), abs(edge)), 1e-9)
        factor = _clean_factor(ratio)
        if factor is None and ratio < 4:
            continue  # mildly out of band is not evidence of a unit slip

        implied = v / factor if (factor and v > hi) else (v * factor if factor else edge)
        k = (f.document, f.mark_key, f.attribute)
        if k in seen:
            continue
        seen.add(k)

        conf = 0.52
        if factor is not None:
            conf += 0.18
        if ratio >= 8:
            conf += 0.06
        if f.unit_raw:
            conf += 0.04
        if not f.verbatim:
            conf -= 0.15
        conf = min(conf, f.confidence + 0.2)

        findings.append(
            Finding(
                document=f.document,
                category="unit-error",
                mark=f.mark or f.mark_key or f.attribute,
                attribute=f.attribute,
                page=f.page,
                container=f.container,
                wrong_raw=f.display(),
                wrong_canon=f.canon_display(),
                correct_raw=f"{fmt_num(implied)} {f.canon_unit or ''}".strip(),
                correct_canon=f"{fmt_num(implied)} {f.canon_unit or ''}".strip(),
                citation=None,
                confidence=max(0.05, min(0.95, conf)),
                rule_id=f"band:{f.attribute}"
                + (f":x{fmt_num(factor)}" if factor else ":out-of-range"),
                evidence=[x for x in (f.verbatim,) if x],
                note=(
                    f"{fmt_num(v)} {f.canon_unit or ''} is "
                    f"{fmt_num(ratio)}x outside the plausible range "
                    f"{fmt_num(lo)}-{fmt_num(hi)} {f.canon_unit or ''}"
                ),
            )
        )

    findings += _dimension_mismatches(facts, seen)
    return findings


def _clean_factor(ratio: float) -> float | None:
    for factor in CLEAN_FACTORS:
        if abs(ratio - factor) / factor <= FACTOR_TOLERANCE:
            return factor
    return None


def _dimension_mismatches(
    facts: list[Fact], seen: set[tuple[str, str, str]]
) -> list[Finding]:
    """Same mark+attribute, same number, incompatible unit dimensions."""
    groups: dict[tuple[str, str], list[Fact]] = defaultdict(list)
    for f in facts:
        if f.mark_key and f.attribute and f.canon_value is not None and f.unit_raw:
            groups[f.key].append(f)

    out: list[Finding] = []
    for (mark_key, attribute), group in groups.items():
        units = {f.canon_unit for f in group if f.canon_unit}
        if len(units) < 2:
            continue
        docs = {norm_doc(f.document) for f in group}
        if len(docs) < 2:
            continue
        # The fact whose unit does not match the attribute's canon carries it.
        from facts import CANONICAL_UNIT  # noqa: PLC0415

        target = CANONICAL_UNIT.get(attribute)
        odd = next((f for f in group if target and f.canon_unit != target), None)
        good = next((f for f in group if target and f.canon_unit == target), None)
        if odd is None or good is None:
            continue
        k = (odd.document, odd.mark_key, attribute)
        if k in seen:
            continue
        seen.add(k)
        out.append(
            Finding(
                document=odd.document,
                category="unit-error",
                mark=odd.mark or mark_key,
                attribute=attribute,
                page=odd.page,
                container=odd.container,
                wrong_raw=odd.display(),
                wrong_canon=odd.canon_display(),
                correct_raw=good.display(),
                correct_canon=good.canon_display(),
                citation=None,
                confidence=0.58,
                rule_id="dimension-mismatch",
                evidence=[x for x in (odd.verbatim, good.verbatim) if x],
                counterpart_document=good.document,
                counterpart_page=good.page,
                note=(
                    f"unit given as {odd.unit_raw} here but "
                    f"{good.unit_raw} in {good.document} p{good.page}"
                ),
            )
        )
    return out
