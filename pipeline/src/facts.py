"""Fact model + unit canonicalization.

A Fact is a single attribute value pulled off one page of one document.
Findings are never produced here — resolvers do that from facts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Any

# ---------------------------------------------------------------------------
# Canonical unit per attribute. Every comparison happens in these units.
# ---------------------------------------------------------------------------

CANONICAL_UNIT: dict[str, str] = {
    "fire_rating": "min",
    "flow": "gpm",
    "capacity": "gal",
    "slope": "in/ft",
    "voltage": "V",
    "power": "kVA",
    "current": "A",
    "size": "in",
    "diameter": "in",
    "thickness": "in",
    "width": "in",
    "height": "in",
    "length": "in",
    "temperature": "F",
    "pressure": "psi",
    "airflow": "cfm",
    "stc": "STC",
    "r_value": "R",
    "count": "ea",
}

# unit_raw (folded) -> (canonical unit, multiplier)
UNIT_TABLE: dict[str, tuple[str, float]] = {
    # time / rating
    "min": ("min", 1),
    "mins": ("min", 1),
    "minute": ("min", 1),
    "minutes": ("min", 1),
    "hr": ("min", 60),
    "hour": ("min", 60),
    "hours": ("min", 60),
    # flow
    "gpm": ("gpm", 1),
    "gallonsperminute": ("gpm", 1),
    "gph": ("gpm", 1 / 60),
    "lpm": ("gpm", 0.264172),
    # volume
    "gal": ("gal", 1),
    "gallon": ("gal", 1),
    "gallons": ("gal", 1),
    "l": ("gal", 0.264172),
    "liter": ("gal", 0.264172),
    "liters": ("gal", 0.264172),
    # length
    "in": ("in", 1),
    "inch": ("in", 1),
    "inches": ("in", 1),
    '"': ("in", 1),
    "ft": ("in", 12),
    "foot": ("in", 12),
    "feet": ("in", 12),
    "'": ("in", 12),
    "mm": ("in", 0.0393701),
    "cm": ("in", 0.393701),
    "m": ("in", 39.3701),
    # slope
    "in/ft": ("in/ft", 1),
    "inperft": ("in/ft", 1),
    "inft": ("in/ft", 1),
    "%": ("in/ft", 0.12),  # 1% = 0.12 in/ft
    "percent": ("in/ft", 0.12),
    # electrical
    "v": ("V", 1),
    "volt": ("V", 1),
    "volts": ("V", 1),
    "kv": ("V", 1000),
    "kva": ("kVA", 1),
    "va": ("kVA", 0.001),
    "kw": ("kVA", 1),
    "w": ("kVA", 0.001),
    "a": ("A", 1),
    "amp": ("A", 1),
    "amps": ("A", 1),
    "ampere": ("A", 1),
    "amperes": ("A", 1),
    # misc
    "f": ("F", 1),
    "degf": ("F", 1),
    "psi": ("psi", 1),
    "cfm": ("cfm", 1),
}

ATTRIBUTE_ALIASES: dict[str, str] = {
    "fire-rating": "fire_rating",
    "firerating": "fire_rating",
    "rating": "fire_rating",
    "fire_resistance_rating": "fire_rating",
    "flow_rate": "flow",
    "flowrate": "flow",
    "gpm": "flow",
    "tank_capacity": "capacity",
    "volume": "capacity",
    "pipe_slope": "slope",
    "pitch": "slope",
    "dia": "diameter",
    "nominal_size": "size",
    "kva": "power",
    "wattage": "power",
    "amperage": "current",
    "temp": "temperature",
    "set_point": "temperature",
}


def canon_attribute(attr: str | None) -> str:
    a = (attr or "").strip().lower().replace(" ", "_").replace("-", "_")
    return ATTRIBUTE_ALIASES.get(a, a)


def canon_mark(mark: str | None) -> str:
    """Normalize an equipment/door/room mark for joining across documents.

    WH-1, WH 1, wh1 all collapse to WH1.
    """
    return re.sub(r"[^A-Z0-9]", "", (mark or "").upper())


_NUM = r"[-+]?\d*\.?\d+"


def parse_value(value_raw: str | None) -> tuple[float | None, str | None]:
    """Pull a number and a unit token out of a raw document string."""
    if not value_raw:
        return None, None
    s = str(value_raw).strip()

    # fractional inches: 3/4", 1-1/2"
    frac = re.match(rf"^({_NUM})?\s*-?\s*(\d+)\s*/\s*(\d+)\s*(.*)$", s)
    if frac and frac.group(2) and frac.group(3):
        whole = float(frac.group(1)) if frac.group(1) else 0.0
        num = float(frac.group(2)) / float(frac.group(3))
        return whole + num, (frac.group(4) or "").strip() or None

    m = re.search(rf"({_NUM})\s*([A-Za-z/%°\"']*)", s)
    if not m:
        return None, None
    try:
        num = float(m.group(1))
    except ValueError:
        return None, None
    return num, (m.group(2) or "").strip() or None


def fold_unit(unit: str | None) -> str:
    if not unit:
        return ""
    u = unit.strip().lower().replace("°", "")
    u = u.replace("\u2033", '"').replace("\u2032", "'")
    if u in ('"', "'", "%", "in/ft"):
        return u
    return re.sub(r"[^a-z/%]", "", u)


def to_canonical(
    value_num: float | None, unit_raw: str | None, attribute: str
) -> tuple[float | None, str | None]:
    """Convert to the canonical unit for this attribute. Returns (value, unit)."""
    if value_num is None:
        return None, None
    target = CANONICAL_UNIT.get(attribute)
    u = fold_unit(unit_raw)
    entry = UNIT_TABLE.get(u)

    if entry is None:
        # No unit in the document (very common in schedules). Trust the
        # attribute's canonical unit rather than guessing a conversion.
        return value_num, target

    canon_u, factor = entry
    if target and canon_u != target:
        # Unit belongs to a different dimension than the attribute claims.
        # Keep the raw number; the resolver will treat this as low confidence.
        return value_num, canon_u
    return value_num * factor, canon_u or target


@dataclass
class Fact:
    document: str
    page: int
    mark: str | None = None
    kind: str | None = None
    attribute: str | None = None
    value_raw: str | None = None
    value_num: float | None = None
    unit_raw: str | None = None
    source: str | None = None
    container: str | None = None
    verbatim: str | None = None
    requirement: bool = False
    applies_to: str | None = None
    citation: str | None = None
    confidence: float = 0.5

    # derived
    mark_key: str = ""
    canon_value: float | None = None
    canon_unit: str | None = None

    extra: dict[str, Any] = field(default_factory=dict)

    def normalize(self) -> "Fact":
        self.attribute = canon_attribute(self.attribute)
        self.mark_key = canon_mark(self.mark)
        if self.value_num is None:
            num, unit = parse_value(self.value_raw)
            self.value_num = num
            if not self.unit_raw:
                self.unit_raw = unit
        self.canon_value, self.canon_unit = to_canonical(
            self.value_num, self.unit_raw, self.attribute or ""
        )
        return self

    @property
    def key(self) -> tuple[str, str]:
        return (self.mark_key, self.attribute or "")

    def display(self) -> str:
        """Raw document string, safe for quoting in a description."""
        return (self.value_raw or "").strip() or (
            f"{fmt_num(self.value_num)} {self.unit_raw or ''}".strip()
        )

    def canon_display(self) -> str:
        if self.canon_value is None:
            return ""
        return f"{fmt_num(self.canon_value)} {self.canon_unit or ''}".strip()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def fmt_num(n: float | None) -> str:
    if n is None:
        return ""
    if abs(n - round(n)) < 1e-9:
        return str(int(round(n)))
    return f"{n:g}"


def fact_from_dict(d: dict[str, Any], document: str, page: int) -> Fact | None:
    if not isinstance(d, dict):
        return None
    try:
        f = Fact(
            document=document,
            page=int(d.get("page") or page),
            mark=_s(d.get("mark")),
            kind=_s(d.get("kind")),
            attribute=_s(d.get("attribute")),
            value_raw=_s(d.get("value_raw")),
            value_num=_f(d.get("value_num")),
            unit_raw=_s(d.get("unit_raw")),
            source=_s(d.get("source")),
            container=_s(d.get("container")),
            verbatim=_s(d.get("verbatim")),
            requirement=bool(d.get("requirement")),
            applies_to=_s(d.get("applies_to")),
            citation=_s(d.get("citation")),
            confidence=_f(d.get("confidence")) or 0.6,
        )
    except Exception:
        return None
    if not f.attribute:
        return None
    # A blank cell is kept: missing.py needs it. A fact with neither a value
    # nor a mark carries no information at all, so drop that.
    if f.value_raw is None and f.value_num is None and not f.mark:
        return None
    return f.normalize()


# Schedule cells that mean "nothing here".
BLANK_TOKENS = {"", "-", "--", "---", "n/a", "na", "none", "tbd", "\u2014", "\u2013"}


def _s(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    if s.lower() in BLANK_TOKENS:
        return None
    return s or None


def _f(v: Any) -> float | None:
    if v is None or isinstance(v, bool):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
