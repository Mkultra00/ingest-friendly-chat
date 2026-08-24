#!/usr/bin/env bash
# Hackathon entry point. Invoked by the harness as:
#   ./run.sh <DATASET_DIR> [OUTPUT_PATH]
#
# Contract: exit 0 with a valid output.json, always. A crash that leaves no
# file scores zero, so every stage is wrapped and the writer runs first.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATASET_DIR="${1:-${DATASET_DIR:-$HERE/dataset}}"
OUTPUT_PATH="${2:-${OUTPUT_PATH:-$HERE/output.json}}"

echo "[run] dataset=$DATASET_DIR output=$OUTPUT_PATH"

# Safety net before anything can fail.
printf '{"errors":[]}' > "$OUTPUT_PATH" 2>/dev/null || true

PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then PY=python; fi

# Only network hosts available in the sandbox are pypi and openrouter.
echo "[run] installing dependencies"
"$PY" -m pip install --quiet --disable-pip-version-check \
  pymupdf pdfplumber requests 2>&1 | tail -5 || \
  echo "[run] dependency install reported problems; continuing"

"$PY" "$HERE/src/main.py" \
  --dataset "$DATASET_DIR" \
  --output "$OUTPUT_PATH" \
  --debug-output "${DEBUG_PATH:-$HERE/debug.json}" \
  || echo "[run] pipeline exited non-zero; keeping whatever output exists"

# Final guard: if the file is missing or unparseable, replace it.
"$PY" - "$OUTPUT_PATH" <<'PYEOF' || true
import json, sys
p = sys.argv[1]
try:
    with open(p) as fh:
        data = json.load(fh)
    assert isinstance(data.get("errors"), list)
    print(f"[run] output.json valid with {len(data['errors'])} findings")
except Exception as exc:
    print(f"[run] output.json invalid ({exc}); writing empty result")
    with open(p, "w") as fh:
        json.dump({"errors": []}, fh)
PYEOF

exit 0
