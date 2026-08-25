import debug from "@/data/demo-debug.json";
import output from "@/data/demo-output.json";

export type Category =
  | "cross-document-conflict"
  | "code-violation"
  | "unit-error"
  | "missing-item";

/** A graded finding as written to output.json. */
export type GradedFinding = {
  document: string;
  category: Category;
  location: string;
  description: string;
};

/** The resolver's own record, used for the review panel. */
export type FindingDetail = {
  document: string;
  category: Category;
  mark: string;
  attribute: string;
  page: number;
  container: string | null;
  wrong_raw: string;
  wrong_canon: string;
  correct_raw: string;
  correct_canon: string;
  citation: string | null;
  confidence: number;
  rule_id: string;
  evidence: string[];
  counterpart_document: string | null;
  counterpart_page: number | null;
  note: string | null;
};

export type Finding = GradedFinding & { id: string; detail?: FindingDetail };

export const CATEGORY_LABEL: Record<Category, string> = {
  "cross-document-conflict": "Cross-document conflict",
  "code-violation": "Code violation",
  "unit-error": "Unit error",
  "missing-item": "Missing item",
};

const details = (debug as { findings?: FindingDetail[] }).findings ?? [];
const graded = (output as { errors?: GradedFinding[] }).errors ?? [];

function matchDetail(f: GradedFinding): FindingDetail | undefined {
  return details.find(
    (d) =>
      d.document === f.document &&
      d.category === f.category &&
      f.description.includes(d.mark),
  );
}

export const findings: Finding[] = graded.map((f, i) => ({
  ...f,
  id: `F${String(i + 1).padStart(2, "0")}`,
  detail: matchDetail(f),
}));

export const factCount = ((debug as { facts?: unknown[] }).facts ?? []).length;

export const documentNames = Array.from(new Set(findings.map((f) => f.document)));

/**
 * The narration script. Spoken aloud, so the numbers are said in full — the
 * point of the readout is that a reviewer hears the mark, the wrong value and
 * the required value without looking at the screen.
 */
export function briefing(items: Finding[]): string {
  if (items.length === 0) {
    return "No findings in the current filter. Nothing to report.";
  }
  const counts = items.reduce<Record<string, number>>((acc, f) => {
    acc[f.category] = (acc[f.category] ?? 0) + 1;
    return acc;
  }, {});
  const breakdown = Object.entries(counts)
    .map(([c, n]) => `${n} ${CATEGORY_LABEL[c as Category].toLowerCase()}${n > 1 ? "s" : ""}`)
    .join(", ");

  const lines = items.map((f, i) => `Finding ${i + 1}. ${spoken(f)}`);
  return [
    `Document review complete. ${items.length} finding${items.length > 1 ? "s" : ""}: ${breakdown}.`,
    ...lines,
    "End of review.",
  ].join(" ");
}

export function spoken(f: Finding): string {
  const d = f.detail;
  const where = `${f.document}, ${f.location}`;
  if (!d) return `${CATEGORY_LABEL[f.category]} in ${where}. ${f.description}`;
  if (f.category === "missing-item") {
    return `${CATEGORY_LABEL[f.category]}. ${d.mark} in ${where} is missing a ${d.attribute.replace(/_/g, " ")}. ${d.note ?? ""}`;
  }
  return (
    `${CATEGORY_LABEL[f.category]}. ${d.mark} in ${where} has a ` +
    `${d.attribute.replace(/_/g, " ")} of ${d.wrong_raw}, but it should be ` +
    `${d.correct_raw}` +
    (d.citation ? `, per ${d.citation}` : "") +
    "."
  );
}
