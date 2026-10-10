"""Print the accuracy evaluation as JSON (used by frontend/scripts/parity.ts)."""

import json
import sys

from app.evaluation import run_evaluation

sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps(run_evaluation(), ensure_ascii=False))
