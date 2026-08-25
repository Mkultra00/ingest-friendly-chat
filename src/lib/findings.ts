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

export type Finding = GradedFinding & { id: string; detail?: FindingDetail | undefined };

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

type RawFact = { document: string; page: number; source?: string | null };

const facts = ((debug as { facts?: RawFact[] }).facts ?? []).filter((f) => f.document);

export const factCount = facts.length;

/** Documents flagged with at least one finding. */
export const documentNames = Array.from(new Set(findings.map((f) => f.document)));

export type ScannedDocument = {
  name: string;
  /** Highest page number any fact was read from. */
  pages: number;
  facts: number;
  findings: number;
  /** What the ingest treated it as: schedule, spec, drawing. */
  kind: string;
};

/** Every document the pipeline actually read, flagged or clean. */
export const scannedDocuments: ScannedDocument[] = Array.from(
  new Set(facts.map((f) => f.document)),
)
  .map((name) => {
    const own = facts.filter((f) => f.document === name);
    const sources = own.map((f) => f.source).filter(Boolean) as string[];
    const kind =
      sources.length > 0
        ? [...sources].sort(
            (a, b) =>
              sources.filter((s) => s === b).length - sources.filter((s) => s === a).length,
          )[0]!
        : "document";
    return {
      name,
      pages: own.reduce((max, f) => Math.max(max, f.page ?? 1), 1),
      facts: own.length,
      findings: findings.filter((f) => f.document === name).length,
      kind,
    };
  })
  .sort((a, b) => b.findings - a.findings || a.name.localeCompare(b.name));


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

  const scanned = scannedDocuments
    .map((d) => `${d.name}, ${d.pages} page${d.pages > 1 ? "s" : ""}`)
    .join("; ");

  const lines = items.map((f, i) => `Finding ${i + 1}. ${spoken(f)}`);
  return [
    `Document review complete. Documents scanned: ${scanned}.`,
    `${items.length} finding${items.length > 1 ? "s" : ""}: ${breakdown}.`,
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
