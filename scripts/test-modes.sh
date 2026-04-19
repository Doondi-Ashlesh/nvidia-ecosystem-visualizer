#!/bin/bash
# Test all optimization modes against TC-2
# Usage: bash scripts/test-modes.sh

INPUT='{"input": "build a medical RAG chatbot for hospitals"}'
BASE="http://localhost:3099/api/analyze-requirements"

PARSE_SCRIPT='
import sys, json, time
try:
    d = json.load(sys.stdin)
except Exception as e:
    print(f"PARSE ERROR: {e}")
    sys.exit(1)
if "error" in d:
    print(f"API ERROR: {d[\"error\"]}")
    print(f"Detail: {d.get(\"detail\",\"\")}")
    sys.exit(1)

gs = d["goalSpec"]
print(f"mode: {d.get(\"mode\", \"N/A\")}")
print(f"exitReason: {d[\"exitReason\"]}")
print(f"adversaryIterations: {d[\"adversaryIterations\"]}")
print(f"latencyMs: {d[\"latencyMs\"]}")
print(f"latencySec: {d[\"latencyMs\"] / 1000:.1f}")
print(f"approvedClean: {d[\"approvedClean\"]}")
print(f"domainTemplate: {d.get(\"domainTemplateUsed\", \"none\")}")
print(f"adversaryModel: {d.get(\"adversaryModel\", \"N/A\")}")
print(f"domain: {gs[\"domain\"]}")
print(f"perfGoals: {len(gs[\"performance_goals\"])}")
print(f"inferredReqs: {len(gs[\"inferred_requirements\"])}")
print(f"gaps: {len(gs[\"gaps\"])}")
print(f"conflicts: {len(gs[\"conflicts\"])}")
print(f"summaryLen: {len(gs[\"summary\"])}")
# Quality indicators
for pg in gs["performance_goals"]:
    print(f"  perf: {pg[\"metric\"]}: {pg[\"target\"]}")
for it in d.get("passes",{}).get("iterations",[]):
    af = it["adversaryFeedback"]
    c = len(af.get("challenges",[]))
    m = len(af.get("missing_requirements",[]))
    a = len(af.get("adjusted_targets",[]))
    print(f"  round{it[\"round\"]}: {c}c {m}m {a}a")
'

echo "=============================================="
echo "TC-2: build a medical RAG chatbot for hospitals"
echo "=============================================="
echo ""

for MODE in selfcritique asymmetric cached combined; do
  echo ">>> Testing mode: $MODE"
  echo ">>> Started at: $(date)"
  RESULT=$(curl -s -X POST "${BASE}?mode=${MODE}" -H "Content-Type: application/json" -d "$INPUT" 2>&1)
  echo "$RESULT" | python -c "$PARSE_SCRIPT"
  echo ""
  echo "----------------------------------------------"
  echo ""
done
