import { useMemo, useState } from "react";
import { Check, FileText, Quote, X } from "lucide-react";

import {
  CATEGORY_LABEL,
  briefing,
  findings as allFindings,
  spoken,
  type Category,
  type Finding,
} from "@/lib/findings";
import { Narrator } from "@/components/Narrator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Verdict = "accepted" | "rejected";

const CATEGORY_STYLE: Record<Category, string> = {
  "cross-document-conflict": "bg-primary/15 text-primary border-primary/30",
  "code-violation": "bg-destructive/15 text-destructive border-destructive/30",
  "unit-error": "bg-accent text-accent-foreground border-border",
  "missing-item": "bg-muted text-muted-foreground border-border",
};

export function FindingsRegister() {
  const [filter, setFilter] = useState<Category | "all">("all");
  const [verdicts, setVerdicts] = useState<Record<string, Verdict | undefined>>({});

  const visible = useMemo(
    () => (filter === "all" ? allFindings : allFindings.filter((f) => f.category === filter)),
    [filter],
  );

  const categories = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const f of allFindings) counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    return [...counts.entries()];
  }, []);

  const script = useMemo(() => briefing(visible), [visible]);

  return (
    <section id="findings" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Findings register</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every finding is produced by deterministic code from extracted facts, so it
            cites the document, page, and value it was derived from.
          </p>
        </div>
        <Narrator cacheKey={`briefing:${filter}:${visible.length}`} text={script} label="Read findings aloud" />
      </header>

      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All {allFindings.length}
        </FilterChip>
        {categories.map(([category, count]) => (
          <FilterChip
            key={category}
            active={filter === category}
            onClick={() => setFilter(category)}
          >
            {CATEGORY_LABEL[category]} {count}
          </FilterChip>
        ))}
      </div>

      <ol className="space-y-4">
        {visible.map((f) => (
          <li key={f.id}>
            <FindingCard
              finding={f}
              verdict={verdicts[f.id]}
              onVerdict={(v) =>
                setVerdicts((prev) => ({ ...prev, [f.id]: prev[f.id] === v ? undefined : v }))
              }
            />
          </li>
        ))}
      </ol>

      {visible.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No findings in this category.
        </p>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FindingCard({
  finding,
  verdict,
  onVerdict,
}: {
  finding: Finding;
  verdict?: Verdict | undefined;
  onVerdict: (v: Verdict) => void;
}) {
  const d = finding.detail;
  return (
    <Card
      className={cn(
        "p-5 transition-opacity",
        verdict === "rejected" && "opacity-55",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{finding.id}</span>
          <Badge variant="outline" className={CATEGORY_STYLE[finding.category]}>
            {CATEGORY_LABEL[finding.category]}
          </Badge>
          {d && (
            <span className="text-xs text-muted-foreground">
              confidence {(d.confidence * 100).toFixed(0)}%
            </span>
          )}
          {verdict && (
            <Badge variant="secondary">
              {verdict === "accepted" ? "Accepted" : "Rejected"}
            </Badge>
          )}
        </div>
        <Narrator
          cacheKey={`finding:${finding.id}`}
          text={spoken(finding)}
          label={`Read finding ${finding.id}`}
          variant="ghost"
          size="icon"
        />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-foreground">{finding.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="size-3.5" />
          {finding.document}
        </span>
        <span>{finding.location}</span>
        {d?.citation && <span>cites {d.citation}</span>}
        {d?.counterpart_document && (
          <span>
            compared against {d.counterpart_document}
            {d.counterpart_page ? ` p${d.counterpart_page}` : ""}
          </span>
        )}
      </div>

      {d && d.evidence.length > 0 && (
        <div className="mt-4 space-y-1.5 rounded-md bg-muted/60 p-3">
          {d.evidence.map((e, i) => (
            <p key={i} className="flex gap-2 font-mono text-xs text-muted-foreground">
              <Quote className="mt-0.5 size-3 shrink-0" />
              {e}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          variant={verdict === "accepted" ? "default" : "outline"}
          onClick={() => onVerdict("accepted")}
        >
          <Check /> Accept
        </Button>
        <Button
          size="sm"
          variant={verdict === "rejected" ? "secondary" : "outline"}
          onClick={() => onVerdict("rejected")}
        >
          <X /> Reject
        </Button>
      </div>
    </Card>
  );
}
