"""Local port of the grader's src/grade.ts.

Line-for-line behaviour match so we can score offline instead of burning
one of our three sandbox test runs.

Usage:
    python3 tools/grade.py output.json fixtures/practice/manifest.json
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any


def norm_doc(name: str | None) -> str:
    if not name:
        return ""
    base = re.split(r"[\\/]", name.strip().lower())[-1]
    return re.sub(r"\.(pdf|md|txt|csv|json|png|jpg)$", "", base, flags=re.I)


def norm_category(cat: str | None) -> str:
    c = (cat or "").strip().lower()
    c = re.sub(r"[^a-z0-9]+", "-", c)
    return c.strip("-")


def fold(text: str) -> str:
    t = text.lower()
    t = re.sub(r"[\u2018\u2019\u2032]", "'", t)
    t = re.sub(r"[\u201c\u201d\u2033]", '"', t)
    return re.sub(r"[^a-z0-9'\"]+", "", t)


def derive_anchors(m: dict[str, Any]) -> list[str]:
    source = f"{m.get('location') or ''} {m.get('description') or ''}"
    tokens = re.split(r"[^A-Za-z0-9/-]+", source)
    seen: list[str] = []
    for t in tokens:
        if re.search(r"\d", t) and len(t) >= 2 and t not in seen:
            seen.append(t)
    return seen


def matches(m: dict[str, Any], r: dict[str, Any]) -> bool:
    if norm_doc(r.get("document")) != norm_doc(m.get("document")):
        return False
    if norm_category(r.get("category")) != norm_category(m.get("category")):
        return False

    rid, mid = r.get("id"), m.get("id")
    if rid and mid and rid.strip().lower() == mid.strip().lower():
        return True

    haystack = f"{r.get('location') or ''} {r.get('description') or ''}".lower()
    page = m.get("page")
    has_page = page is not None
    keywords = m.get("keywords") or derive_anchors(m)
    if not has_page and not keywords:
        return True

    if has_page:
        numbers = [int(n) for n in re.findall(r"\d+", haystack)]
        if int(page) in numbers:
            return True

    folded = fold(haystack)
    for kw in keywords:
        if kw and (kw.lower() in haystack or fold(kw) in folded):
            return True
    return False


def grade(reported: list[dict], key: list[dict]) -> dict[str, Any]:
    used_reports: set[int] = set()
    hits: list[tuple[dict, dict]] = []
    misses: list[dict] = []

    for m in key:
        found = None
        for i, r in enumerate(reported):
            if i in used_reports:
                continue
            if matches(m, r):
                found = (m, r)
                used_reports.add(i)
                break
        if found:
            hits.append(found)
        else:
            misses.append(m)

    matched = len(hits)
    precision = matched / len(reported) if reported else 0.0
    recall = matched / len(key) if key else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    false_positives = [r for i, r in enumerate(reported) if i not in used_reports]

    return {
        "reported": len(reported),
        "matched": matched,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "hits": hits,
        "misses": misses,
        "false_positives": false_positives,
    }


def main() -> None:
    out_path = sys.argv[1] if len(sys.argv) > 1 else "output.json"
    key_path = sys.argv[2] if len(sys.argv) > 2 else "fixtures/practice/manifest.json"

    with open(out_path, encoding="utf-8") as f:
        reported = json.load(f).get("errors", [])
    with open(key_path, encoding="utf-8") as f:
        key = json.load(f).get("errors", [])

    res = grade(reported, key)

    print(f"reported={res['reported']}  matched={res['matched']}  of {len(key)} key entries")
    print(
        f"precision={res['precision']:.3f}  recall={res['recall']:.3f}  F1={res['f1']:.3f}"
    )
    if res["hits"]:
        print("\nMATCHED")
        for m, r in res["hits"]:
            print(f"  [{m.get('id', '?')}] {m.get('document')} / {m.get('category')}")
            print(f"        -> {r.get('description')}")
    if res["misses"]:
        print("\nMISSED (recall loss)")
        for m in res["misses"]:
            kws = m.get("keywords") or derive_anchors(m)
            print(f"  [{m.get('id', '?')}] {m.get('document')} / {m.get('category')}")
            print(f"        needs one of: {kws}")
            print(f"        key says: {m.get('description')}")
    if res["false_positives"]:
        print("\nFALSE POSITIVES (precision loss)")
        for r in res["false_positives"]:
            print(f"  {r.get('document')} / {r.get('category')} :: {r.get('description')}")

    sys.exit(0)


if __name__ == "__main__":
    main()
