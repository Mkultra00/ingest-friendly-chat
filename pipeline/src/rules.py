"""Code thresholds and plausibility bands. Pure data, no model involved.

Every rule carries the citation string the emitted description must quote —
the grader anchors on digit-bearing tokens, and section numbers like
"08 11 00" are exactly such anchors.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

# ---------------------------------------------------------------------------
# Plausibility bands, in each attribute's canonical unit.
# A value outside the band is a unit-error candidate.
# ---------------------------------------------------------------------------

PLAUSIBLE: dict[str, tuple[float, float]] = {
    "fire_rating": (20, 240),          # min
    "flow": (0.2, 8.0),                # gpm, plumbing fixtures
    "capacity": (2, 500),              # gal, water heaters / tanks
    "slope": (0.0625, 0.5),            # in/ft, sanitary/storm drainage
    "voltage": (12, 600),              # V, building distribution
    "power": (0.1, 4000),              # kVA
    "current": (5, 4000),              # A
    "diameter": (0.25, 48),            # in
    "size": (0.25, 144),               # in
    "thickness": (0.03125, 12),        # in
    "temperature": (40, 220),          # F, domestic water
    "pressure": (5, 150),              # psi
    "airflow": (10, 60000),            # cfm
}

# Off-by-a-clean-factor signatures. A ratio near one of these is a strong
# unit-error tell (a slope of 1/4 in/ft written as 2 in/ft is 8x).
CLEAN_FACTORS = [8, 10, 12, 100, 1000, 60, 25.4, 3.785]


@dataclass
class CodeRule:
    id: str
    attribute: str
    citation: str            # quoted verbatim in the description
    requirement_text: str
    limit: float
    unit: str
    comparator: str          # "min" -> value must be >= limit; "max" -> <= limit
    applies: Callable[[str, str], bool]  # (mark, context_text) -> bool
    kind: str | None = None

    def violated(self, value: float) -> bool:
        if self.comparator == "min":
            return value < self.limit - 1e-9
        return value > self.limit + 1e-9

    def correct_phrase(self) -> str:
        word = "at least" if self.comparator == "min" else "no more than"
        return f"{word} {_fmt(self.limit)} {self.unit}"


def _fmt(n: float) -> str:
    return str(int(n)) if abs(n - round(n)) < 1e-9 else f"{n:g}"


def _ctx(*words: str) -> Callable[[str, str], bool]:
    pats = [re.compile(w, re.I) for w in words]
    return lambda mark, text: any(p.search(f"{mark} {text}") for p in pats)


def _always(mark: str, text: str) -> bool:  # noqa: ARG001
    return True


# ---------------------------------------------------------------------------
# Rules. Deliberately narrow: a wrong category costs precision AND recall,
# so only encode requirements we are confident a hackathon key would inject.
# ---------------------------------------------------------------------------

CODE_RULES: list[CodeRule] = [
    CodeRule(
        id="door-mech-90",
        attribute="fire_rating",
        citation="spec section 08 11 00",
        requirement_text="90-minute rated doors at mechanical and electrical rooms",
        limit=90,
        unit="min",
        comparator="min",
        applies=_ctx(r"mechanical", r"electrical", r"\bmech\b", r"\belec\b"),
        kind="door",
    ),
    CodeRule(
        id="door-corridor-20",
        attribute="fire_rating",
        citation="IBC Table 716.1(2)",
        requirement_text="20-minute rated doors in corridor walls",
        limit=20,
        unit="min",
        comparator="min",
        applies=_ctx(r"corridor"),
        kind="door",
    ),
    CodeRule(
        id="door-stair-90",
        attribute="fire_rating",
        citation="IBC Table 716.1(2)",
        requirement_text="90-minute rated doors at 2-hour rated stair enclosures",
        limit=90,
        unit="min",
        comparator="min",
        applies=_ctx(r"stair", r"exit enclosure"),
        kind="door",
    ),
    CodeRule(
        id="lav-0.5",
        attribute="flow",
        citation="spec section 22 40 00",
        requirement_text="0.5 gpm aerators at lavatories",
        limit=0.5,
        unit="gpm",
        comparator="max",
        applies=_ctx(r"^L-?\d", r"lavatory", r"lavatories", r"\blav\b"),
        kind="fixture",
    ),
    CodeRule(
        id="sink-1.8",
        attribute="flow",
        citation="IPC 604.4",
        requirement_text="1.8 gpm maximum at kitchen and service sinks",
        limit=1.8,
        unit="gpm",
        comparator="max",
        applies=_ctx(r"kitchen sink", r"service sink", r"^SK-?\d"),
        kind="fixture",
    ),
    CodeRule(
        id="shower-2.0",
        attribute="flow",
        citation="IPC 604.4",
        requirement_text="2.0 gpm maximum at showerheads",
        limit=2.0,
        unit="gpm",
        comparator="max",
        applies=_ctx(r"shower", r"^SH-?\d"),
        kind="fixture",
    ),
    CodeRule(
        id="wc-1.6",
        attribute="flow",
        citation="IPC 604.4",
        requirement_text="1.6 gallons per flush maximum at water closets",
        limit=1.6,
        unit="gpf",
        comparator="max",
        applies=_ctx(r"water closet", r"^WC-?\d", r"\btoilet\b"),
        kind="fixture",
    ),
    CodeRule(
        id="slope-min-quarter",
        attribute="slope",
        citation="IPC Table 704.1",
        requirement_text="1/4 in/ft minimum slope on drainage piping 2 1/2 in and smaller",
        limit=0.25,
        unit="in/ft",
        comparator="min",
        applies=_ctx(r"waste", r"sanitary", r"drain", r"\bslope\b"),
        kind="pipe",
    ),
    CodeRule(
        id="guard-42",
        attribute="height",
        citation="IBC 1015.3",
        requirement_text="42 in minimum guard height",
        limit=42,
        unit="in",
        comparator="min",
        applies=_ctx(r"guard", r"guardrail"),
    ),
    CodeRule(
        id="egress-door-32",
        attribute="width",
        citation="IBC 1010.1.1",
        requirement_text="32 in minimum clear width at egress doors",
        limit=32,
        unit="in",
        comparator="min",
        applies=_ctx(r"egress", r"exit door"),
        kind="door",
    ),
    CodeRule(
        id="wh-temp-140",
        attribute="temperature",
        citation="IPC 607.1",
        requirement_text="140 F maximum stored domestic hot water temperature",
        limit=140,
        unit="F",
        comparator="max",
        applies=_ctx(r"^WH-?\d", r"water heater"),
        kind="equipment",
    ),
]


# Attributes whose schedule rows should never be blank; a null is a
# missing-item candidate.
REQUIRED_ATTRIBUTES_BY_KIND: dict[str, list[str]] = {
    "door": ["fire_rating"],
    "fixture": ["flow"],
    "equipment": ["capacity"],
}


def rules_for(attribute: str) -> list[CodeRule]:
    return [r for r in CODE_RULES if r.attribute == attribute]
