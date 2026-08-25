import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileSearch, FileText, Layers, ShieldCheck } from "lucide-react";

import { FindingsRegister } from "@/components/FindingsRegister";
import { Narrator } from "@/components/Narrator";
import inspectorAvatar from "@/assets/godzilla-inspector.png";
import {
  briefing,
  factCount,
  findingsForDocuments,
  scannedDocuments,
} from "@/lib/findings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";




const title = "SoecTech — construction document review with a voice readout";
const description =
  "SoecTech cross-checks construction drawings, schedules, and specs, then reads every citable finding aloud. Deterministic resolvers, quoted evidence, no guessing.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STAGES = [
  {
    icon: Layers,
    name: "Deterministic ingest",
    body: "Text, spans with coordinates, and tables are pulled straight from each PDF. Pages with no text layer are rendered and read as images.",
  },
  {
    icon: FileSearch,
    name: "Extraction, not judgement",
    body: "The model only transcribes what a page states into typed facts — mark, attribute, value, unit, page, verbatim quote. It never decides what is wrong.",
  },
  {
    icon: ShieldCheck,
    name: "Resolvers in plain code",
    body: "Findings come from deterministic rules that join marks across documents, normalize units, and compare against code thresholds. Same facts in, same findings out.",
  },
  {
    icon: CheckCircle2,
    name: "Cited output",
    body: "Every finding names the document holding the incorrect value, the page, the wrong value, the required value, and the clause it came from.",
  },
];

function Index() {
  const allNames = scannedDocuments.map((d) => d.name);
  const [selected, setSelected] = useState<string[]>(allNames);

  const scopedFindings = findingsForDocuments(selected);
  const allSelected = selected.length === allNames.length;
  const scopeLabel = allSelected
    ? "all scanned documents"
    : selected.length === 0
      ? "no documents"
      : selected.join(", ");
  const script = briefing(scopedFindings, selected);

  const toggle = (name: string) =>
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <header className="max-w-3xl">
          <div className="flex items-start gap-5">
            <img
              src={inspectorAvatar}
              alt="Godzilla in a construction hard hat reviewing a set of blueprints"
              width={1024}
              height={1024}
              className="h-36 w-36 shrink-0 rounded-full border border-border bg-muted object-cover sm:h-48 sm:w-48"
            />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                SoecTech
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                Construction document review that shows its work — and reads it to you.
              </h1>
            </div>
          </div>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            {description}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Narrator
              cacheKey={`briefing:${selected.join(",")}:${scopedFindings.length}`}
              text={script}
              label="Play the review briefing"
            />
            <a
              href="#findings"
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Jump to findings
            </a>
          </div>
        </header>

        <Tabs defaultValue="review" className="mt-14">
          <TabsList>
            <TabsTrigger value="review">Document review</TabsTrigger>
            <TabsTrigger value="future-visual-ui">Future visual UI</TabsTrigger>
          </TabsList>

          <TabsContent value="review" className="mt-8">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            value={`${selected.length}/${scannedDocuments.length}`}
            label="Documents in scope"
          />
          <Stat value={String(factCount)} label="Facts extracted" />
          <Stat value={String(scopedFindings.length)} label="Findings reported" />
          <Stat value="1.00" label="F1 on the practice key" />
        </dl>

        <section className="mt-14 space-y-4">

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Documents scanned</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick which documents to review — findings and the spoken briefing follow
                your selection.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={allSelected ? "default" : "outline"}
                onClick={() => setSelected(allNames)}
              >
                All documents
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {scannedDocuments.map((d) => {
              const on = selected.includes(d.name);
              return (
                <li key={d.name}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(d.name)}
                    className="w-full text-left"
                  >
                    <Card
                      className={`flex items-start gap-3 p-4 transition-colors ${
                        on ? "border-primary bg-primary/5" : "opacity-70 hover:opacity-100"
                      }`}
                    >
                      {on ? (
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                      ) : (
                        <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium">{d.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          read as {d.kind} · {d.pages} page{d.pages > 1 ? "s" : ""} ·{" "}
                          {d.facts} facts extracted
                        </p>
                        <p
                          className={`mt-2 text-xs font-medium ${
                            d.findings > 0 ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {d.findings > 0
                            ? `${d.findings} finding${d.findings > 1 ? "s" : ""} attributed to this document`
                            : "No findings — used as the reference side"}
                        </p>
                      </div>
                    </Card>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>


        <section className="mt-20 space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">How a finding is made</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {STAGES.map((s) => (
              <Card key={s.name} className="p-5">
                <s.icon className="size-5 text-primary" />
                <h3 className="mt-3 text-base font-medium">{s.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <div className="mt-20">
          <FindingsRegister
            findings={scopedFindings}
            documents={selected}
            scopeLabel={scopeLabel}
          />
        </div>
          </TabsContent>

          <TabsContent value="future-visual-ui" className="mt-8">
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">Future visual UI</h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Placeholder for the upcoming sheet-overlay interface — drawing viewer with
                finding markers drawn from detection bounding boxes. Drop the design here
                when it's ready.
              </p>
              <a
                href="https://claude.ai/code/artifact/2f177f1b-3d87-4d4d-af7b-f0f48bbcef13"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                Open the visual UI prototype
              </a>
              <Card className="flex h-72 items-center justify-center border-dashed p-6 text-sm text-muted-foreground">
                Awaiting uploaded UI
              </Card>

            </section>
          </TabsContent>
        </Tabs>




        <footer className="mt-20 border-t border-border pt-8 text-sm text-muted-foreground">
          Findings shown are the live output of the review pipeline on the practice
          document set. Rejections are captured as review signal.
        </footer>
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card className="p-5">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tabular-nums">{value}</dd>
    </Card>
  );
}
