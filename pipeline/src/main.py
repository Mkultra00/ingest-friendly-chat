"""Entry point. Orchestrates the four stages and always writes output.json.

Usage:
    python src/main.py --dataset <DATASET_DIR> --output output.json

Contract with the harness: a valid output.json must exist when this process
exits, even if ingest crashes or every model call fails. An empty errors list
scores zero; a missing or malformed file scores zero and looks broken.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from emit import select, write_debug, write_output  # noqa: E402
from extract import extract_all  # noqa: E402
from ingest import ingest_all  # noqa: E402
from llm import Chat  # noqa: E402
from resolvers import resolve_all  # noqa: E402


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--dataset",
        default=os.environ.get("DATASET_DIR", "dataset"),
        help="directory of source documents",
    )
    p.add_argument(
        "--output",
        default=os.environ.get("OUTPUT_PATH", "output.json"),
        help="where to write the graded output",
    )
    p.add_argument(
        "--debug-output",
        default=os.environ.get("DEBUG_PATH", ""),
        help="optional sidecar with facts + full findings (never graded)",
    )
    p.add_argument(
        "--facts-cache",
        default=os.environ.get("FACTS_CACHE", ""),
        help="reuse facts from this JSON file instead of calling the model",
    )
    return p.parse_args()


def safety_net(path: str) -> None:
    """Write a valid empty result immediately, so a later crash still leaves a
    parseable file behind."""
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"errors": []}, fh)
    except Exception:  # noqa: BLE001
        pass


def load_cached_facts(path: str) -> list:
    from facts import fact_from_dict  # noqa: PLC0415

    with open(path, encoding="utf-8") as fh:
        raw = json.load(fh)
    items = raw.get("facts", raw) if isinstance(raw, dict) else raw
    out = []
    for d in items:
        f = fact_from_dict(d, d.get("document", ""), int(d.get("page") or 1))
        if f is not None:
            out.append(f)
    return out


def main() -> int:
    args = parse_args()
    started = time.time()
    safety_net(args.output)

    facts = []
    try:
        if args.facts_cache and os.path.exists(args.facts_cache):
            facts = load_cached_facts(args.facts_cache)
            print(f"[main] loaded {len(facts)} cached facts")
        else:
            pages, docs = ingest_all(args.dataset)
            if not pages:
                print(f"[main] no readable documents in {args.dataset}")
            else:
                chat = Chat()
                facts = extract_all(chat, pages, docs)
    except Exception:  # noqa: BLE001 - never crash without an output file
        print("[main] extraction stage failed:")
        traceback.print_exc()

    findings = []
    try:
        findings = resolve_all(facts)
        print(f"[main] {len(findings)} candidate findings")
    except Exception:  # noqa: BLE001
        print("[main] resolver stage failed:")
        traceback.print_exc()

    kept = select(findings)
    payload = write_output(args.output, kept)

    if args.debug_output:
        write_debug(args.debug_output, findings, facts)

    by_cat: dict[str, int] = {}
    for e in payload["errors"]:
        by_cat[e["category"]] = by_cat.get(e["category"], 0) + 1
    print(
        f"[main] wrote {len(payload['errors'])} findings to {args.output} "
        f"in {time.time() - started:.1f}s {by_cat or ''}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
