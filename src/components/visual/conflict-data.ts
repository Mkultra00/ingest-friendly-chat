/* Data ported from the Conflict Review visual prototype. */
/* eslint-disable */
export type Tone = "drawn" | "gov" | "plain" | "none";
export type Sev = "critical" | "major" | "minor" | "trivial";
export type Status = "open" | "resolved" | "verify" | "dismissed";
export type Loc = { sheet: string; sheetTitle: string; file: string; ref: string; x: string; y: string; w: string; h: string; before: string; hit: string; after: string; should: string; shouldRef: string };
export type Row = { attr: string; vals: [string, Tone][]; check: keyof typeof CHECK; sev?: Sev; note?: string; loc?: Loc };
export type Item = {
  mark: string; name: string; loc: string; group: string; headline: string; rule: string;
  authority: { tier: keyof typeof TIER; doc: string; why: string }[];
  sources: { doc: string; ref: string; kind: Tone }[];
  rows: Row[];
  spec: { name: string; mfr: string; verdict: string; attrs: { k: string; v: string; color: string }[] };
  fix?: { name: string; mfr: string; attrs: { k: string; v: string; color: string }[] };
  alts?: { name: string; key: string; cost: string }[];
};

export const OK = "#0E8F72", BAD = "#C8372A", NEU = "#3C414A", DIM = "#9AA0A8";

export const TONE = {
  drawn: { bg: "rgba(183,118,28,0.13)", fg: "#9A5A11", weight: "500" },
  gov:   { bg: "rgba(31,79,203,0.11)", fg: "#1F4FCB", weight: "500" },
  plain: { bg: "transparent", fg: "#5C616B", weight: "400" },
  none:  { bg: "transparent", fg: DIM, weight: "400" }
};

export const SEV = {
  critical: { label: "Critical", rank: 3, fg: "#C8372A", bg: "rgba(200,55,42,0.1)", dot: "#C8372A", glow: "rgba(200,55,42,0.28)", fill: "rgba(200,55,42,0.07)",
    blurb: "Life-safety, code, or permit basis. Resolve before the set goes out." },
  major: { label: "Major", rank: 2, fg: "#9A5A11", bg: "rgba(183,118,28,0.13)", dot: "#C2801F", glow: "rgba(183,118,28,0.26)", fill: "rgba(183,118,28,0.08)",
    blurb: "Wrong material, capacity, or quantity gets built or bought." },
  minor: { label: "Minor", rank: 1, fg: "#7A6A17", bg: "rgba(160,140,30,0.13)", dot: "#B0982A", glow: "rgba(160,140,30,0.22)", fill: "rgba(160,140,30,0.07)",
    blurb: "Worth correcting in the next issue; low downstream cost." },
  trivial: { label: "Likely fine", rank: 0, fg: "#0E8F72", bg: "rgba(14,143,114,0.11)", dot: "#0E8F72", glow: "rgba(14,143,114,0.2)", fill: "rgba(14,143,114,0.06)",
    blurb: "Cosmetic or already covered elsewhere — probably no action needed." }
};

export const TIER = {
  governs:     { label: "Governs",     fg: "#FFFFFF", bg: "#1F4FCB", border: "rgba(31,79,203,0.35)", cardBg: "rgba(31,79,203,0.05)" },
  supports:    { label: "Supports",    fg: "#1F4FCB", bg: "rgba(31,79,203,0.11)", border: "rgba(0,0,0,0.07)", cardBg: "#FFFFFF" },
  subordinate: { label: "Subordinate", fg: "#9A5A11", bg: "rgba(183,118,28,0.13)", border: "rgba(0,0,0,0.07)", cardBg: "#FFFFFF" }
};

export const CHECK = { match: { label: "match", fg: DIM }, conflict: { label: "conflict", fg: "#9A5A11" }, violation: { label: "code", fg: "#C8372A" }, missing: { label: "missing", fg: "#7A6A17" } };
export const STATUS_NOTE = { open: "Unreviewed", resolved: "Confirmed — in the RFI package", verify: "Flagged for field verification", dismissed: "Closed — no action" };

export const ITEMS: Item[] = [
  {
    mark: "D-202", name: "Door — hollow metal, rated", loc: "Mechanical 101", group: "Doors & Openings",
    headline: "The schedule, the specification, and the life-safety plan describe this opening three different ways. The fire rating is the disagreement that matters.",
    rule: "Division 01: specifications govern over drawing schedules for materials and ratings.",
    authority: [
      { tier: "governs", doc: "spec-08-11-00.pdf", why: "Project specification, latest issue. Sets the required assembly rating." },
      { tier: "supports", doc: "ls-101-lifesafety.pdf", why: "Permitted life-safety plan — agrees with the spec on the barrier." },
      { tier: "subordinate", doc: "door-schedule.pdf", why: "Drawing schedule. Loses to the spec where they disagree." }
    ],
    sources: [
      { doc: "door-schedule.pdf", ref: "p.2 · Door schedule", kind: "drawn" },
      { doc: "spec-08-11-00.pdf", ref: "p.6 · 2.1.C", kind: "gov" },
      { doc: "ls-101-lifesafety.pdf", ref: "p.1 · Barrier plan", kind: "gov" }
    ],
    rows: [
      { attr: "Fire rating", vals: [["45 min", "drawn"], ["90 min", "gov"], ["2 hr wall", "plain"]], check: "conflict", sev: "critical",
        note: "Two documents call for a 90-minute assembly at this barrier; the door schedule carries 45 minutes. The specification governs, so the schedule is the incorrect document.",
        loc: { sheet: "A-601", sheetTitle: "Door & frame schedule", file: "door-schedule.pdf · page 2", ref: "row D-202", x: "9%", y: "40%", w: "48%", h: "13%",
          before: "D-202   MECHANICAL 101   HM/HM   ", hit: "45 MIN", after: "   HW-4",
          should: "90 min", shouldRef: "spec-08-11-00.pdf p.6 · 2.1.C" } },
      { attr: "Leaf size", vals: [["3'-0\" × 7'-0\"", "plain"], ["—", "none"], ["—", "none"]], check: "match" },
      { attr: "Frame material", vals: [["HM, welded", "plain"], ["HM, welded", "plain"], ["—", "none"]], check: "match" },
      { attr: "Core", vals: [["honeycomb", "drawn"], ["mineral", "gov"], ["—", "none"]], check: "conflict", sev: "major",
        note: "A honeycomb core cannot carry a 90-minute label. Follows directly from the rating conflict above — resolve both together.",
        loc: { sheet: "A-601", sheetTitle: "Door & frame schedule", file: "door-schedule.pdf · page 2", ref: "row D-202, core column", x: "44%", y: "40%", w: "23%", h: "13%",
          before: "CORE:  ", hit: "HONEYCOMB", after: "   (non-rated)",
          should: "mineral core", shouldRef: "spec-08-11-00.pdf p.6 · 2.1.C" } },
      { attr: "Hardware set", vals: [["HW-4", "plain"], ["HW-4", "plain"], ["—", "none"]], check: "match" },
      { attr: "Closer required", vals: [["yes", "plain"], ["yes", "plain"], ["yes", "plain"]], check: "match" }
    ],
    spec: { name: "Sentry HM-45 Hollow Metal Door", mfr: "Cordell Openings", verdict: "Under-rated",
      attrs: [{ k: "Fire rating", v: "45 min", color: BAD }, { k: "Label", v: "UL 10C, 45 min", color: BAD }, { k: "Core", v: "Honeycomb", color: NEU }] },
    fix: { name: "Sentry HM-90 Hollow Metal Door", mfr: "Cordell Openings",
      attrs: [{ k: "Fire rating", v: "90 min", color: OK }, { k: "Label", v: "UL 10C, 90 min", color: OK }, { k: "Cost delta", v: "+$240 / leaf", color: NEU }] },
    alts: [{ name: "Ironline 90 STC-rated", key: "90 min", cost: "+$410" }, { name: "Cordell FG-90 fiberglass", key: "90 min", cost: "+$520" }]
  },
  {
    mark: "D-104", name: "Door — wood, non-rated", loc: "Exam 104", group: "Doors & Openings",
    headline: "Every source agrees on this opening. Nothing to review.",
    rule: "Division 01: specifications govern over drawing schedules for materials and ratings.",
    authority: [
      { tier: "governs", doc: "spec-08-14-00.pdf", why: "Project specification. Nothing in it conflicts with the schedule." },
      { tier: "subordinate", doc: "door-schedule.pdf", why: "Drawing schedule — matches the spec on every attribute." }
    ],
    sources: [
      { doc: "door-schedule.pdf", ref: "p.2 · Door schedule", kind: "drawn" },
      { doc: "spec-08-14-00.pdf", ref: "p.3 · 2.2.A", kind: "gov" }
    ],
    rows: [
      { attr: "Fire rating", vals: [["none", "plain"], ["none req'd", "plain"]], check: "match" },
      { attr: "Leaf size", vals: [["3'-0\" × 7'-0\"", "plain"], ["—", "none"]], check: "match" },
      { attr: "Facing", vals: [["WD, stain grade", "plain"], ["WD, stain grade", "plain"]], check: "match" },
      { attr: "Hardware set", vals: [["HW-1", "plain"], ["HW-1", "plain"]], check: "match" }
    ],
    spec: { name: "Larkspur Flush Wood Door", mfr: "Cordell Openings", verdict: "Verified",
      attrs: [{ k: "Rating", v: "Non-rated", color: OK }, { k: "Facing", v: "Stain-grade maple", color: OK }, { k: "Lead time", v: "5 weeks", color: NEU }] }
  },
  {
    mark: "L-1", name: "Lavatory faucet — wall hung", loc: "Public restrooms, typ.", group: "Plumbing Fixtures",
    headline: "The scheduled flow rate is ten times the specified aerator limit, and the specified product carries the schedule's value.",
    rule: "The permitted energy compliance report and the specification both outrank the fixture schedule.",
    authority: [
      { tier: "governs", doc: "energy-comcheck.pdf", why: "Basis of the permit. Its water-use assumptions cannot change without a re-submittal." },
      { tier: "supports", doc: "spec-22-40-00.pdf", why: "Specification agrees: 0.5 gpm aerators, WaterSense listed." },
      { tier: "subordinate", doc: "fixture-schedule.pdf", why: "Drawing schedule. The 5.0 gpm value here is the outlier." }
    ],
    sources: [
      { doc: "fixture-schedule.pdf", ref: "p.4 · Fixture schedule", kind: "drawn" },
      { doc: "spec-22-40-00.pdf", ref: "p.11 · 2.2.A.3", kind: "gov" },
      { doc: "energy-comcheck.pdf", ref: "p.5 · Water use", kind: "gov" }
    ],
    rows: [
      { attr: "Flow rate", vals: [["5.0 gpm", "drawn"], ["0.5 gpm", "gov"], ["0.5 gpm", "gov"]], check: "conflict", sev: "major",
        note: "A factor-of-ten discrepancy on the same fixture mark; the specification and the submitted energy compliance form agree on 0.5 gpm. Reads like a decimal shift in the schedule.",
        loc: { sheet: "P-601", sheetTitle: "Plumbing fixture schedule", file: "fixture-schedule.pdf · page 4", ref: "row L-1", x: "11%", y: "27%", w: "44%", h: "12%",
          before: "L-1   LAVATORY, WALL HUNG   ", hit: "5.0 GPM", after: " @ 60 PSI",
          should: "0.5 gpm", shouldRef: "spec-22-40-00.pdf p.11 · 2.2.A.3" } },
      { attr: "WaterSense", vals: [["not listed", "drawn"], ["required", "gov"], ["assumed", "plain"]], check: "conflict", sev: "minor",
        note: "The specified faucet is not WaterSense listed, which the specification requires and the compliance form assumes.",
        loc: { sheet: "P-601", sheetTitle: "Plumbing fixture schedule", file: "fixture-schedule.pdf · page 4", ref: "row L-1, notes column", x: "58%", y: "27%", w: "26%", h: "12%",
          before: "NOTES:  ", hit: "no WaterSense listing", after: "",
          should: "WaterSense listed", shouldRef: "spec-22-40-00.pdf p.11 · 2.2.A.3" } },
      { attr: "Mounting", vals: [["wall, 4\" ctr", "plain"], ["wall, 4\" ctr", "plain"], ["—", "none"]], check: "match" },
      { attr: "Handle type", vals: [["lever", "plain"], ["lever, ADA", "plain"], ["—", "none"]], check: "match" },
      { attr: "Finish", vals: [["brushed nickel", "drawn"], ["chrome", "gov"], ["—", "none"]], check: "conflict", sev: "trivial",
        note: "The schedule says brushed nickel, the spec's basis-of-design is chrome. Finish is an owner selection and the spec allows equal finishes — note it, do not raise an RFI.",
        loc: { sheet: "P-601", sheetTitle: "Plumbing fixture schedule", file: "fixture-schedule.pdf · page 4", ref: "row L-1, finish column", x: "48%", y: "27%", w: "20%", h: "12%",
          before: "FINISH:  ", hit: "BR. NICKEL", after: "",
          should: "chrome (or equal)", shouldRef: "spec-22-40-00.pdf p.11 · 2.2.B" } }
    ],
    spec: { name: "Meridian ML-2 Lavatory Faucet", mfr: "Vantage Fixtures", verdict: "Attribute mismatch",
      attrs: [{ k: "Flow rate", v: "5.0 gpm", color: BAD }, { k: "WaterSense", v: "Not listed", color: BAD }, { k: "Lead time", v: "3 weeks", color: NEU }] },
    fix: { name: "Meridian ML-2/LF low-flow", mfr: "Vantage Fixtures",
      attrs: [{ k: "Flow rate", v: "0.5 gpm", color: OK }, { k: "WaterSense", v: "Listed", color: OK }, { k: "Cost delta", v: "+$18 / ea", color: NEU }] },
    alts: [{ name: "Corbet Series 40 aerated", key: "0.5 gpm", cost: "−$6" }, { name: "Halden pressure-assist L2", key: "0.35 gpm", cost: "+$31" }]
  },
  {
    mark: "SAN-4", name: "Sanitary branch — 4\" PVC", loc: "Level 1 east chase", group: "Plumbing Fixtures",
    headline: "The plan note slopes this branch eight times steeper than the specification, which puts the invert below the site connection.",
    rule: "Specifications and the civil invert survey govern over plan keynotes.",
    authority: [
      { tier: "governs", doc: "spec-22-13-00.pdf", why: "Specification sets the minimum slope for 3\" and larger piping." },
      { tier: "supports", doc: "c-201-utilities.pdf", why: "Civil invert table only closes at the specified slope." },
      { tier: "subordinate", doc: "p-101-plumbing.pdf", why: "Plan keynote. The 2\" per foot note here is physically impossible." }
    ],
    sources: [
      { doc: "p-101-plumbing.pdf", ref: "p.1 · Keynote 6", kind: "drawn" },
      { doc: "spec-22-13-00.pdf", ref: "p.4 · 3.3.B", kind: "gov" },
      { doc: "c-201-utilities.pdf", ref: "p.2 · Invert table", kind: "gov" }
    ],
    rows: [
      { attr: "Slope", vals: [["2\" per ft", "drawn"], ["1/4\" per ft", "gov"], ["—", "none"]], check: "conflict", sev: "critical",
        note: "Eight times the specified minimum. The civil invert table only closes at 1/4\" per foot, so the plan note is the error.",
        loc: { sheet: "P-101", sheetTitle: "Plumbing plan — level 1", file: "p-101-plumbing.pdf · page 1", ref: "keynote 6, east chase", x: "56%", y: "20%", w: "27%", h: "22%",
          before: "6.  SLOPE 4\" SAN. BRANCH @ ", hit: "2\" PER FT", after: " MIN.",
          should: "1/4\" per ft", shouldRef: "spec-22-13-00.pdf p.4 · 3.3.B" } },
      { attr: "Invert at connection", vals: [["−9.4 ft", "drawn"], ["—", "none"], ["−3.1 ft", "gov"]], check: "conflict", sev: "major",
        note: "Following the plan note produces an invert 6.3 ft below the civil connection point. Consequence of the slope error.",
        loc: { sheet: "P-101", sheetTitle: "Plumbing plan — level 1", file: "p-101-plumbing.pdf · page 1", ref: "invert callout, south wall", x: "20%", y: "58%", w: "31%", h: "17%",
          before: "INV. AT SITE CONN. ", hit: "−9.4 FT", after: " (CALC.)",
          should: "−3.1 ft", shouldRef: "c-201-utilities.pdf p.2 · Invert table" } },
      { attr: "Diameter", vals: [["4\"", "plain"], ["4\"", "plain"], ["4\"", "plain"]], check: "match" },
      { attr: "Material", vals: [["PVC DWV", "plain"], ["PVC DWV", "plain"], ["—", "none"]], check: "match" }
    ],
    spec: { name: "4\" PVC DWV branch piping", mfr: "Meridian Pipe Systems", verdict: "Impossible run",
      attrs: [{ k: "Noted slope", v: "2\" / ft", color: BAD }, { k: "Resulting invert", v: "−9.4 ft", color: BAD }, { k: "Diameter", v: "4\"", color: NEU }] },
    fix: { name: "4\" PVC DWV branch @ 1/4\" per ft", mfr: "Meridian Pipe Systems",
      attrs: [{ k: "Slope", v: "1/4\" / ft", color: OK }, { k: "Resulting invert", v: "−3.1 ft", color: OK }, { k: "Cost delta", v: "no change", color: NEU }] },
    alts: [{ name: "Cast iron no-hub", key: "1/4\"/ft", cost: "+62% / lf" }, { name: "4\" PVC @ 1/8\" per ft", key: "1/8\"/ft", cost: "no change" }]
  },
  {
    mark: "W-4", name: "Window — aluminum punched", loc: "North elevation, typ.", group: "Envelope",
    headline: "The scheduled glazing is worse than the U-factor the permitted compliance report assumed.",
    rule: "The permitted compliance report is the basis of the approval — the schedule has to meet it.",
    authority: [
      { tier: "governs", doc: "energy-comcheck.pdf", why: "Submitted for permit. Changing its assumptions means re-submitting." },
      { tier: "supports", doc: "spec-08-51-00.pdf", why: "Specification caps U-factor at the same value." },
      { tier: "subordinate", doc: "window-schedule.pdf", why: "Drawing schedule. Its U-0.45 glass fails the permitted path." }
    ],
    sources: [
      { doc: "window-schedule.pdf", ref: "p.1 · Window schedule", kind: "drawn" },
      { doc: "energy-comcheck.pdf", ref: "p.3 · Envelope", kind: "gov" },
      { doc: "spec-08-51-00.pdf", ref: "p.7 · 2.3", kind: "gov" }
    ],
    rows: [
      { attr: "U-factor", vals: [["0.45", "drawn"], ["0.32", "gov"], ["0.32 max", "gov"]], check: "conflict", sev: "critical",
        note: "The compliance report was the basis of the permit, so the scheduled glazing has to move to meet it.",
        loc: { sheet: "A-701", sheetTitle: "Window schedule & types", file: "window-schedule.pdf · page 1", ref: "row W-4, thermal column", x: "36%", y: "34%", w: "30%", h: "13%",
          before: "W-4  ALUM. PUNCHED  IGU  ", hit: "U-0.45", after: "  SHGC 0.38",
          should: "U-0.32 max", shouldRef: "energy-comcheck.pdf p.3 · Envelope" } },
      { attr: "SHGC", vals: [["0.38", "plain"], ["0.40 max", "plain"], ["0.40 max", "plain"]], check: "match" },
      { attr: "VLT", vals: [["62%", "drawn"], ["60% nom.", "gov"], ["—", "none"]], check: "conflict", sev: "trivial",
        note: "Two points of visible light transmittance apart, inside the manufacturer's stated tolerance. No action.",
        loc: { sheet: "A-701", sheetTitle: "Window schedule & types", file: "window-schedule.pdf · page 1", ref: "row W-4, VLT column", x: "66%", y: "34%", w: "17%", h: "13%",
          before: "VLT  ", hit: "62%", after: "",
          should: "60% nominal", shouldRef: "spec-08-51-00.pdf p.7 · 2.3" } },
      { attr: "Frame system", vals: [["thermally broken", "plain"], ["—", "none"], ["thermally broken", "plain"]], check: "match" }
    ],
    spec: { name: "ClearSpan IGU, low-e #2", mfr: "Clearview Glass", verdict: "Fails permit basis",
      attrs: [{ k: "U-factor", v: "0.45", color: BAD }, { k: "SHGC", v: "0.38", color: NEU }, { k: "Lead time", v: "8 weeks", color: NEU }] },
    fix: { name: "ClearSpan IGU-T, triple low-e", mfr: "Clearview Glass",
      attrs: [{ k: "U-factor", v: "0.30", color: OK }, { k: "SHGC", v: "0.36", color: OK }, { k: "Cost delta", v: "+$14 / sf", color: NEU }] },
    alts: [{ name: "ClearSpan IGU-WS warm edge", key: "U-0.32", cost: "+$6 / sf" }, { name: "Revise COMcheck to U-0.45", key: "recalc", cost: "$0 material" }]
  },
  {
    mark: "GR-1", name: "Guardrail — terrace picket", loc: "Level 2 terrace", group: "Envelope",
    headline: "The detail dimensions a picket spacing the code does not allow. No document disagrees — the drawing simply violates the code.",
    rule: "The building code outranks every project document.",
    authority: [
      { tier: "governs", doc: "IBC 2021 §1015.4", why: "Adopted code. No project document can permit a wider opening." },
      { tier: "subordinate", doc: "a-501-details.pdf", why: "Detail dimensions 5\" clear — non-compliant as drawn." }
    ],
    sources: [
      { doc: "a-501-details.pdf", ref: "p.3 · Detail 4", kind: "drawn" },
      { doc: "IBC 2021 §1015.4", ref: "Opening limits", kind: "gov" }
    ],
    rows: [
      { attr: "Opening / spacing", vals: [["5\" clear", "drawn"], ["< 4\" sphere", "gov"]], check: "violation", sev: "critical",
        note: "Required guards may not pass a 4-inch sphere; the detail dimensions 5 inches clear. No exception applies at this occupancy.",
        loc: { sheet: "A-501", sheetTitle: "Exterior details", file: "a-501-details.pdf · page 3", ref: "detail 4, dimension string", x: "17%", y: "28%", w: "35%", h: "31%",
          before: "VERT. PICKETS @ ", hit: "5\" O.C. CLR", after: " TYP.",
          should: "< 4\" sphere", shouldRef: "IBC 2021 §1015.4" } },
      { attr: "Guard height", vals: [["42\"", "plain"], ["42\" min", "plain"]], check: "match" },
      { attr: "Load", vals: [["200 lb conc.", "plain"], ["200 lb conc.", "plain"]], check: "match" }
    ],
    spec: { name: "Terrace picket guard, 5\" spacing", mfr: "Northline Metals", verdict: "Non-compliant",
      attrs: [{ k: "Opening", v: "5\" clear", color: BAD }, { k: "Height", v: "42\"", color: OK }, { k: "Finish", v: "RAL 7016", color: NEU }] },
    fix: { name: "Terrace picket guard, 3.875\" spacing", mfr: "Northline Metals",
      attrs: [{ k: "Opening", v: "3.875\" clear", color: OK }, { k: "Height", v: "42\"", color: OK }, { k: "Cost delta", v: "+4% / lf", color: NEU }] },
    alts: [{ name: "Northline mesh infill", key: "0.75\" mesh", cost: "+11% / lf" }, { name: "Clearview glass guard", key: "no openings", cost: "+38% / lf" }]
  },
  {
    mark: "RTU-2", name: "Rooftop unit — packaged", loc: "Roof, west curb", group: "Mechanical",
    headline: "The unit is drawn on the roof plan and carried by the structural framing, but it never made it into the equipment schedule.",
    rule: "Where a mark exists on the drawings, the schedule is the document that has to catch up.",
    authority: [
      { tier: "governs", doc: "m-201-roofplan.pdf", why: "The unit is tagged and located here; the design intent is not in question." },
      { tier: "supports", doc: "s-301-framing.pdf", why: "Structure already frames a curb for it — the unit is real." },
      { tier: "subordinate", doc: "m-401-schedules.pdf", why: "Equipment schedule is missing the row entirely." }
    ],
    sources: [
      { doc: "m-401-schedules.pdf", ref: "p.2 · RTU schedule", kind: "drawn" },
      { doc: "m-201-roofplan.pdf", ref: "p.1 · Roof plan", kind: "gov" },
      { doc: "s-301-framing.pdf", ref: "p.2 · Curb loads", kind: "gov" }
    ],
    rows: [
      { attr: "Scheduled", vals: [["no row", "drawn"], ["RTU-2 tagged", "gov"], ["curb framed", "gov"]], check: "missing", sev: "critical",
        note: "The mark appears on two documents and is absent from the schedule that enumerates equipment. Nothing in the set gives its capacity, weight, or electrical data.",
        loc: { sheet: "M-201", sheetTitle: "Mechanical roof plan", file: "m-201-roofplan.pdf · page 1", ref: "west curb, tagged RTU-2", x: "13%", y: "19%", w: "27%", h: "25%",
          before: "TAG ON PLAN: ", hit: "RTU-2", after: "  — no schedule row",
          should: "row in RTU schedule", shouldRef: "m-401-schedules.pdf p.2" } },
      { attr: "Capacity", vals: [["—", "none"], ["6 tons (note)", "plain"], ["—", "none"]], check: "missing", sev: "major",
        note: "Only a plan note implies capacity; the schedule that should carry it has no row.",
        loc: { sheet: "M-201", sheetTitle: "Mechanical roof plan", file: "m-201-roofplan.pdf · page 1", ref: "note 3 near west curb", x: "42%", y: "52%", w: "29%", h: "15%",
          before: "3.  RTU-2 ", hit: "6 TONS (ASSUMED)", after: " — CONFIRM",
          should: "scheduled capacity", shouldRef: "m-401-schedules.pdf p.2" } },
      { attr: "Operating weight", vals: [["—", "none"], ["—", "none"], ["1,200 lb assumed", "gov"]], check: "missing", sev: "minor",
        note: "Structural sized the curb against an assumed weight that no schedule confirms.",
        loc: { sheet: "S-301", sheetTitle: "Roof framing plan", file: "s-301-framing.pdf · page 2", ref: "curb load note, grid D-4", x: "50%", y: "23%", w: "31%", h: "19%",
          before: "CURB DESIGN LOAD ", hit: "1,200 LB ASSUMED", after: "",
          should: "confirmed unit weight", shouldRef: "m-401-schedules.pdf p.2" } },
      { attr: "Curb height", vals: [["—", "none"], ["14\"", "plain"], ["14\"", "plain"]], check: "match" }
    ],
    spec: { name: "RTU-2 — not specified", mfr: "no manufacturer in set", verdict: "No data",
      attrs: [{ k: "Capacity", v: "not scheduled", color: BAD }, { k: "Weight", v: "not scheduled", color: BAD }, { k: "Electrical", v: "not scheduled", color: BAD }] },
    fix: { name: "Ridgeline RT-6 packaged RTU (6 ton)", mfr: "Halden Mechanical",
      attrs: [{ k: "Capacity", v: "6 tons", color: OK }, { k: "Weight", v: "1,180 lb", color: OK }, { k: "Electrical", v: "208V/3φ, 34 MCA", color: OK }] },
    alts: [{ name: "Ridgeline RT-6-HE", key: "6 tons", cost: "+$3.1k" }, { name: "Vantage VP-72", key: "6 tons", cost: "−$900" }]
  }
];
