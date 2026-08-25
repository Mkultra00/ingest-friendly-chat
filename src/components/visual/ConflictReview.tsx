import { useMemo, useState } from "react";
import {
  CHECK,
  ITEMS,
  SEV,
  STATUS_NOTE,
  TIER,
  TONE,
  type Item,
  type Row,
  type Status,
} from "./conflict-data";

const keyOf = (mark: string, attr: string) => `${mark}::${attr}`;
const isFlagged = (r: Row) => r.check !== "match";
const isEscalatable = (r: Row) => isFlagged(r) && r.sev !== "trivial";

const GROUP_ORDER = ["Doors & Openings", "Plumbing Fixtures", "Envelope", "Mechanical"];
const FILTERS = [
  { key: "flagged", label: "Flagged" },
  { key: "all", label: "All" },
  { key: "clean", label: "Clean" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

export default function ConflictReview({
  showAlternates = true,
  tableShowsFlaggedOnly = false,
}: {
  showAlternates?: boolean;
  tableShowsFlaggedOnly?: boolean;
}) {
  const [selMark, setSelMark] = useState("D-202");
  const [filter, setFilter] = useState<Filter>("flagged");
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "D-202::Fire rating": true,
  });
  const [focusAttr, setFocusAttr] = useState<string | null>("Fire rating");
  const [railOpen, setRailOpen] = useState(false);

  const statusOf = (k: string): Status => status[k] ?? "open";
  const openCount = (i: Item) =>
    i.rows.filter((r) => isEscalatable(r) && statusOf(keyOf(i.mark, r.attr)) === "open").length;
  const notedCount = (i: Item) =>
    i.rows.filter(
      (r) => isFlagged(r) && r.sev === "trivial" && statusOf(keyOf(i.mark, r.attr)) === "open",
    ).length;
  const worstOpen = (i: Item) => {
    let w: Row["sev"] | null = null;
    i.rows.forEach((r) => {
      if (!isEscalatable(r) || statusOf(keyOf(i.mark, r.attr)) !== "open") return;
      if (!w || SEV[r.sev!].rank > SEV[w].rank) w = r.sev!;
    });
    return w;
  };

  const sel = useMemo(() => ITEMS.find((i) => i.mark === selMark) ?? ITEMS[0], [selMark]);

  const select = (mark: string) => {
    const item = ITEMS.find((i) => i.mark === mark)!;
    const first = item.rows.find(isFlagged);
    setSelMark(mark);
    setFocusAttr(first ? first.attr : null);
    setRailOpen(false);
    setExpanded(first ? { [keyOf(mark, first.attr)]: true } : {});
  };
  const setStatusFor = (k: string, s: Status) => setStatus((p) => ({ ...p, [k]: s }));

  const flaggedRows = sel.rows.filter((r) => isFlagged(r) && r.loc);
  const focusRow = flaggedRows.find((r) => r.attr === focusAttr) ?? flaggedRows[0] ?? null;

  const counts = {
    items: ITEMS.length,
    open: ITEMS.reduce((n, i) => n + openCount(i), 0),
    noted: ITEMS.reduce((n, i) => n + notedCount(i), 0),
    critical: ITEMS.reduce(
      (n, i) =>
        n +
        i.rows.filter(
          (r) =>
            isEscalatable(r) &&
            r.sev === "critical" &&
            statusOf(keyOf(i.mark, r.attr)) === "open",
        ).length,
      0,
    ),
  };

  const passes = (i: Item) => {
    const flagged = i.rows.some(isFlagged);
    return filter === "all" ? true : filter === "flagged" ? flagged : !flagged;
  };

  const groups = GROUP_ORDER.map((g) => ({
    label: g,
    items: ITEMS.filter((i) => i.group === g && passes(i)),
  })).filter((g) => g.items.length);

  const openN = openCount(sel);
  const notedN = notedCount(sel);
  const fSev = focusRow ? SEV[focusRow.sev!] : SEV.trivial;
  const fl = focusRow?.loc ?? null;
  const focus = fl
    ? {
        sheet: fl.sheet,
        sheetTitle: fl.sheetTitle,
        ref: fl.ref,
        attr: focusRow!.attr,
        calloutLabel: `${sel.mark} · ${fl.ref}`,
        x: fl.x,
        y: fl.y,
        w: fl.w,
        h: fl.h,
        before: fl.before,
        hit: fl.hit,
        after: fl.after,
        should: fl.should,
        shouldRef: fl.shouldRef,
        dot: fSev.dot,
        glowColor: fSev.glow,
        fill: fSev.fill,
        sevLabel: fSev.label,
        sevFg: fSev.fg,
        sevBg: fSev.bg,
      }
    : {
        sheet: "—",
        sheetTitle: "no flagged location on this item",
        ref: "—",
        attr: "all sources agree",
        calloutLabel: sel.mark,
        x: "38%",
        y: "38%",
        w: "24%",
        h: "20%",
        before: "",
        hit: "no conflict found",
        after: "",
        should: "—",
        shouldRef: "—",
        dot: "#C4C2BB",
        glowColor: "rgba(0,0,0,0.08)",
        fill: "rgba(0,0,0,0.03)",
        sevLabel: "clean",
        sevFg: "#0E8F72",
        sevBg: "rgba(14,143,114,0.11)",
      };

  const visibleRows = sel.rows.filter((r) => !tableShowsFlaggedOnly || isFlagged(r));
  const specV = sel.spec.verdict === "Verified";

  return (
    <div
      style={{
        minWidth: 1180,
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        color: "#17181B",
        background: "#F6F5F2",
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 20, padding: "18px 28px" }}>
        <button
          onClick={() => setRailOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            font: "inherit",
            fontSize: 13.5,
            fontWeight: 500,
            padding: "10px 16px",
            background: "#FFFFFF",
            border: "1px solid rgba(0,0,0,0.09)",
            borderRadius: 11,
            cursor: "pointer",
            flex: "none",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ display: "block", width: 14, height: 1.5, background: "#6B7078" }} />
            ))}
          </span>
          {railOpen ? "Hide items" : "Items"}
        </button>

        <div style={{ minWidth: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Riverside Medical Office Building
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginLeft: "auto",
            paddingRight: 4,
          }}
        >
          {[
            { v: counts.critical, l: "critical", c: "#C8372A" },
            { v: counts.open, l: "open", c: undefined },
            { v: counts.noted, l: "noted", c: "#0E8F72" },
          ].map((s) => (
            <div key={s.l} style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ fontSize: 23, fontWeight: 600, color: s.c, lineHeight: 1 }}>{s.v}</span>
              <span style={{ fontSize: 13.5, color: "#6B7078" }}>{s.l}</span>
            </div>
          ))}
        </div>

        <button
          style={{
            font: "inherit",
            fontSize: 13.5,
            fontWeight: 600,
            padding: "12px 20px",
            background: "#17181B",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 11,
            cursor: "pointer",
            flex: "none",
          }}
        >
          Issue {counts.open} RFIs
        </button>
      </header>

      {railOpen && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 344,
            zIndex: 20,
            background: "#FFFFFF",
            borderRight: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "30px 0 70px rgba(23,24,27,0.13)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "22px 22px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Items</div>
            <div style={{ fontSize: 13, color: "#8A8F98" }}>{counts.items} checked</div>
            <button
              onClick={() => setRailOpen(false)}
              style={{
                marginLeft: "auto",
                font: "inherit",
                fontSize: 13,
                padding: "7px 13px",
                background: "transparent",
                color: "#6B7078",
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 9,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
          <div style={{ padding: "0 22px 14px", display: "flex", gap: 7 }}>
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    font: "inherit",
                    fontSize: 12.5,
                    padding: "7px 13px",
                    border: `1px solid ${on ? "#17181B" : "rgba(0,0,0,0.12)"}`,
                    borderRadius: 9,
                    background: on ? "#17181B" : "transparent",
                    color: on ? "#FFFFFF" : "#6B7078",
                    cursor: "pointer",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "0 16px 24px" }}>
            {groups.map((g) => (
              <div key={g.label}>
                <div style={{ padding: "12px 6px 8px", fontSize: 12.5, color: "#9AA0A8" }}>
                  {g.label}
                </div>
                {g.items.map((i) => {
                  const active = i.mark === sel.mark;
                  const open = openCount(i);
                  const noted = notedCount(i);
                  const worst = worstOpen(i);
                  const sv = worst ? SEV[worst] : null;
                  const anyFlag = i.rows.some(isFlagged);
                  return (
                    <div
                      key={i.mark}
                      onClick={() => select(i.mark)}
                      style={{
                        padding: "13px 15px",
                        marginBottom: 7,
                        border: `1px solid ${active ? "#17181B" : "rgba(0,0,0,0.08)"}`,
                        borderRadius: 13,
                        background: active ? "#FAFAF8" : "#FFFFFF",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 7,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            flex: "none",
                            borderRadius: "50%",
                            background: sv ? sv.dot : noted ? "#0E8F72" : "#D2D0CA",
                          }}
                        />
                        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {i.mark}
                        </span>
                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: 12,
                            whiteSpace: "nowrap",
                            color: sv ? sv.fg : noted ? "#0E8F72" : "#9AA0A8",
                          }}
                        >
                          {sv
                            ? `${sv.label.toLowerCase()} · ${open}`
                            : noted
                              ? `${noted} noted`
                              : anyFlag
                                ? "cleared"
                                : "clean"}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.4, color: "#5C616B" }}>{i.name}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(700px,1fr) 348px",
          alignItems: "start",
          gap: 22,
          padding: "8px 28px 48px",
          minHeight: 0,
        }}
      >
        <main style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div style={{ fontSize: 13, color: "#8A8F98", marginBottom: 8 }}>
              {sel.group} · {sel.loc}
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 36,
                lineHeight: 1.06,
                letterSpacing: "-0.03em",
                fontWeight: 600,
              }}
            >
              <span style={{ color: "#0E8F72", marginRight: 12 }}>{sel.mark}</span>
              {sel.name}
            </h2>
          </div>

          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid rgba(0,0,0,0.07)",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "17px 22px 15px" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>What each document says</div>
              <div style={{ marginLeft: "auto", fontSize: 13, color: "#8A8F98" }}>
                {openN || notedN ? `${openN} open · ${notedN} noted` : "all sources agree"}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "stretch", padding: "0 22px 10px" }}>
              <div style={{ width: 150, flex: "none", fontSize: 12.5, color: "#9AA0A8" }}>Attribute</div>
              {sel.sources.map((s) => (
                <div key={s.doc} style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11.5,
                      lineHeight: 1.4,
                      color: s.kind === "gov" ? "#1F4FCB" : "#9A5A11",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {s.doc}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#9AA0A8", marginTop: 2 }}>{s.ref}</div>
                </div>
              ))}
              <div style={{ width: 104, flex: "none" }} />
            </div>

            {visibleRows.map((r) => {
              const k = keyOf(sel.mark, r.attr);
              const flagged = isFlagged(r);
              const st = statusOf(k);
              const settled = flagged && st !== "open";
              const chk = CHECK[r.check];
              const sv = flagged ? SEV[r.sev!] : null;
              const focused = !!focusRow && r.attr === focusRow.attr;
              const checkLabel = settled
                ? st === "dismissed"
                  ? "cleared"
                  : st === "verify"
                    ? "field verify"
                    : "in RFI"
                : flagged
                  ? sv!.label
                  : chk.label;
              const checkFg = settled
                ? st === "dismissed"
                  ? "#9AA0A8"
                  : "#0E8F72"
                : flagged
                  ? sv!.fg
                  : chk.fg;
              const checkBg = settled
                ? st === "dismissed"
                  ? "transparent"
                  : "rgba(14,143,114,0.11)"
                : flagged
                  ? sv!.bg
                  : "transparent";
              const rowBg = focused && flagged && !settled ? "#FBFAF7" : "transparent";
              const isOpen = flagged && !!expanded[k];
              return (
                <div key={r.attr}>
                  <div
                    onClick={
                      flagged
                        ? () => {
                            setFocusAttr(r.attr);
                            setExpanded((p) => ({ ...p, [k]: !p[k] }));
                          }
                        : undefined
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "13px 22px",
                      borderTop: "1px solid rgba(0,0,0,0.055)",
                      background: rowBg,
                      cursor: flagged ? "pointer" : "default",
                    }}
                  >
                    <div
                      style={{
                        width: 150,
                        flex: "none",
                        fontSize: 13.5,
                        fontWeight: 500,
                        paddingRight: 12,
                      }}
                    >
                      {r.attr}
                    </div>
                    {r.vals.map(([v, tone], idx) => {
                      const t = TONE[settled && tone !== "plain" ? "plain" : tone];
                      return (
                        <div key={idx} style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
                          <span
                            style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: 12.5,
                              fontWeight: Number(t.weight),
                              color: t.fg,
                              background: t.bg,
                              padding: "2px 6px",
                              borderRadius: 6,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {v}
                          </span>
                        </div>
                      );
                    })}
                    <div
                      style={{ width: 104, flex: "none", display: "flex", justifyContent: "flex-end" }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: checkFg,
                          background: checkBg,
                          padding: "4px 11px",
                          borderRadius: 20,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {checkLabel}
                      </span>
                    </div>
                  </div>

                  {isOpen && (
                    <div
                      style={{
                        padding: "4px 22px 22px 172px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                        background: rowBg,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13.5,
                          lineHeight: 1.55,
                          color: "#6B7078",
                          maxWidth: "72ch",
                        }}
                      >
                        <span style={{ fontWeight: 600, color: checkFg }}>{checkLabel}</span> —{" "}
                        {sv?.blurb}
                      </div>
                      {r.note && (
                        <div
                          style={{
                            fontSize: 13.5,
                            lineHeight: 1.55,
                            color: "#3C414A",
                            maxWidth: "72ch",
                          }}
                        >
                          {r.note}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                        {isEscalatable(r) && (
                          <>
                            <button
                              onClick={() => setStatusFor(k, "resolved")}
                              style={{
                                font: "inherit",
                                fontSize: 13,
                                fontWeight: 600,
                                padding: "10px 16px",
                                background: "#17181B",
                                color: "#FFFFFF",
                                border: "none",
                                borderRadius: 10,
                                cursor: "pointer",
                              }}
                            >
                              Raise RFI
                            </button>
                            <button
                              onClick={() => setStatusFor(k, "verify")}
                              style={{
                                font: "inherit",
                                fontSize: 13,
                                fontWeight: 500,
                                padding: "10px 16px",
                                background: "#FFFFFF",
                                color: "#17181B",
                                border: "1px solid rgba(0,0,0,0.14)",
                                borderRadius: 10,
                                cursor: "pointer",
                              }}
                            >
                              Send to field verify
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setStatusFor(k, "dismissed")}
                          style={{
                            font: "inherit",
                            fontSize: 13,
                            fontWeight: 500,
                            padding: "10px 16px",
                            background: "transparent",
                            color: "#6B7078",
                            border: "1px solid rgba(0,0,0,0.1)",
                            borderRadius: 10,
                            cursor: "pointer",
                          }}
                        >
                          {isEscalatable(r) ? "Not a conflict" : "Acknowledge"}
                        </button>
                        <span style={{ fontSize: 12.5, color: "#9AA0A8" }}>{STATUS_NOTE[st]}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ---- location ---- */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid rgba(0,0,0,0.07)",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "17px 22px 15px" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Where it is</div>
              <div style={{ fontSize: 13.5, color: "#8A8F98" }}>
                {focus.sheet} · {focus.sheetTitle}
              </div>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 12,
                  fontWeight: 600,
                  color: focus.sevFg,
                  background: focus.sevBg,
                  padding: "4px 11px",
                  borderRadius: 20,
                  whiteSpace: "nowrap",
                }}
              >
                {focus.sevLabel} · {focus.attr}
              </span>
            </div>

            <div
              style={{
                position: "relative",
                height: 330,
                margin: "0 22px",
                background: "#F1EFEA",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 16,
                  backgroundImage:
                    "repeating-linear-gradient(135deg,rgba(23,24,27,0.05) 0 2px,transparent 2px 12px)",
                  borderRadius: 8,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: focus.x,
                  top: focus.y,
                  width: focus.w,
                  height: focus.h,
                  border: `2px solid ${focus.dot}`,
                  borderRadius: 8,
                  background: focus.fill,
                  boxShadow: `0 6px 26px ${focus.glowColor}`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: -2,
                    top: -30,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "#FFFFFF",
                    background: focus.dot,
                    padding: "4px 10px",
                    borderRadius: 8,
                    whiteSpace: "nowrap",
                  }}
                >
                  {focus.calloutLabel}
                </div>
              </div>

              <div
                style={{
                  position: "absolute",
                  right: 20,
                  bottom: 20,
                  width: 392,
                  background: "#FFFFFF",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 13,
                  boxShadow: "0 12px 34px rgba(23,24,27,0.14)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "13px 16px 11px" }}>
                  <div style={{ fontSize: 12, color: "#8A8F98", marginBottom: 7 }}>
                    As drawn · {focus.ref}
                  </div>
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 12.5,
                      lineHeight: 1.7,
                      color: "#3C414A",
                    }}
                  >
                    {focus.before}
                    <span
                      style={{
                        color: "#9A5A11",
                        background: "rgba(183,118,28,0.14)",
                        fontWeight: 500,
                        padding: "1px 5px",
                        borderRadius: 5,
                      }}
                    >
                      {focus.hit}
                    </span>
                    {focus.after}
                  </div>
                </div>
                <div
                  style={{
                    padding: "11px 16px 13px",
                    borderTop: "1px solid rgba(0,0,0,0.07)",
                    background: "#FAFAF8",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#8A8F98", marginBottom: 5 }}>Should be</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: "#1F4FCB",
                      }}
                    >
                      {focus.should}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "#8A8F98",
                        marginLeft: "auto",
                        textAlign: "right",
                      }}
                    >
                      {focus.shouldRef}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "15px 22px 18px",
                overflowX: "auto",
              }}
            >
              <span style={{ fontSize: 12.5, color: "#8A8F98", flex: "none" }}>Flagged here</span>
              {flaggedRows.map((r) => {
                const on = !!focusRow && r.attr === focusRow.attr;
                const sv = SEV[r.sev!];
                return (
                  <button
                    key={r.attr}
                    onClick={() => setFocusAttr(r.attr)}
                    style={{
                      font: "inherit",
                      fontSize: 12.5,
                      padding: "7px 13px",
                      border: `1px solid ${on ? sv.dot : "rgba(0,0,0,0.12)"}`,
                      borderRadius: 20,
                      background: on ? sv.bg : "#FFFFFF",
                      color: on ? sv.fg : "#6B7078",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flex: "none",
                    }}
                  >
                    {r.attr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---- source of truth ---- */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid rgba(0,0,0,0.07)",
              borderRadius: 16,
              padding: "20px 22px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Source of truth</div>
              <div style={{ fontSize: 13, color: "#8A8F98" }}>{sel.rule}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {sel.authority.map((a) => {
                const t = TIER[a.tier];
                return (
                  <div
                    key={a.doc}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "12px 14px",
                      border: `1px solid ${t.border}`,
                      borderRadius: 12,
                      background: t.cardBg,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: t.fg,
                        background: t.bg,
                        padding: "4px 10px",
                        borderRadius: 20,
                        whiteSpace: "nowrap",
                        flex: "none",
                      }}
                    >
                      {t.label}
                    </span>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 12.5,
                        color: "#17181B",
                        flex: "none",
                      }}
                    >
                      {a.doc}
                    </span>
                    <span style={{ fontSize: 13.5, color: "#6B7078", lineHeight: 1.45 }}>{a.why}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* ============ SIDE PANEL ============ */}
        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            minWidth: 0,
            position: "sticky",
            top: 8,
          }}
        >
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid rgba(0,0,0,0.07)",
              borderRadius: 16,
              padding: "18px 18px 14px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 12.5, color: "#8A8F98" }}>Specified</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "4px 11px",
                  borderRadius: 20,
                  background: specV ? "rgba(14,143,114,0.11)" : "rgba(200,55,42,0.1)",
                  color: specV ? "#0E8F72" : "#C8372A",
                }}
              >
                {sel.spec.verdict}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{sel.spec.name}</div>
            <div style={{ fontSize: 13, color: "#8A8F98", marginTop: 4 }}>{sel.spec.mfr}</div>
            <div style={{ marginTop: 12 }}>
              {sel.spec.attrs.slice(0, 3).map((a) => (
                <div
                  key={a.k}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "8px 0",
                    borderTop: "1px solid rgba(0,0,0,0.055)",
                  }}
                >
                  <span style={{ fontSize: 13, color: "#6B7078" }}>{a.k}</span>
                  <span
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: a.color,
                      textAlign: "right",
                    }}
                  >
                    {a.v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {sel.fix && (
            <>
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1.5px solid rgba(14,143,114,0.5)",
                  borderRadius: 16,
                  padding: 18,
                  boxShadow: "0 4px 18px rgba(14,143,114,0.1)",
                }}
              >
                <div
                  style={{ fontSize: 12.5, fontWeight: 600, color: "#0E8F72", marginBottom: 11 }}
                >
                  Compliant match
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{sel.fix.name}</div>
                <div style={{ fontSize: 13, color: "#8A8F98", marginTop: 4 }}>{sel.fix.mfr}</div>
                <div style={{ marginTop: 12 }}>
                  {sel.fix.attrs.slice(0, 3).map((a) => (
                    <div
                      key={a.k}
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "8px 0",
                        borderTop: "1px solid rgba(0,0,0,0.055)",
                      }}
                    >
                      <span style={{ fontSize: 13, color: "#6B7078" }}>{a.k}</span>
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 12.5,
                          fontWeight: 500,
                          color: a.color,
                          textAlign: "right",
                        }}
                      >
                        {a.v}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const updates: Record<string, Status> = {};
                    sel.rows
                      .filter(isEscalatable)
                      .forEach((r) => (updates[keyOf(sel.mark, r.attr)] = "resolved"));
                    setStatus((p) => ({ ...p, ...updates }));
                  }}
                  style={{
                    width: "100%",
                    marginTop: 16,
                    font: "inherit",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "11px 12px",
                    background: "#0E8F72",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  Log substitution
                </button>
              </div>

              {showAlternates && !!sel.alts?.length && (
                <div
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid rgba(0,0,0,0.07)",
                    borderRadius: 16,
                    padding: "16px 18px 6px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  }}
                >
                  <div style={{ fontSize: 12.5, color: "#8A8F98", marginBottom: 6 }}>Alternates</div>
                  {sel.alts.slice(0, 2).map((alt) => (
                    <div
                      key={alt.name}
                      style={{
                        padding: "11px 0",
                        borderTop: "1px solid rgba(0,0,0,0.055)",
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 13.5, lineHeight: 1.4, color: "#3C414A" }}>
                        {alt.name}
                      </span>
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11.5,
                          color: "#8A8F98",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {alt.key} · {alt.cost}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
