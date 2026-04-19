#!/bin/bash
# Comprehensive test suite for Stage 1 pipeline
# Tests both baseline and grounded default modes across diverse enterprise use cases
#
# Usage: bash scripts/test-suite.sh [mode]
#   mode: "baseline" or "default" (grounded). Defaults to both.

BASE="http://localhost:3099/api/analyze-requirements"
MODE=${1:-"both"}
OUTDIR="docs/test-results"
mkdir -p "$OUTDIR"

PARSE_SCRIPT='
import sys, json
try:
    d = json.load(sys.stdin)
except Exception as e:
    print(f"PARSE_ERROR|{e}")
    sys.exit(0)
if "error" in d:
    print(f"API_ERROR|{d[\"error\"]}|{d.get(\"detail\",\"\")[:100]}")
    sys.exit(0)
gs = d["goalSpec"]
gt = d.get("groundTruth", {})
bps = gt.get("blueprintsMatched", [])

# Count grounded vs inference challenges
grounded = 0
inference = 0
for it in d.get("passes",{}).get("iterations",[]):
    for ch in it["adversaryFeedback"].get("challenges",[]):
        g = ch.get("grounding","unknown")
        if g == "grounded": grounded += 1
        elif g == "inference": inference += 1

# Check if inferred reqs mention specific NVIDIA services
nvidia_services = ["nim","nemo","tensorrt","triton","nemotron","guardrails","retriever","curator","rapids","megatron","cuopt"]
svc_mentions = 0
for ir in gs.get("inferred_requirements",[]):
    txt = ir.get("requirement","").lower()
    if any(s in txt for s in nvidia_services):
        svc_mentions += 1

print(f"OK|{d.get(\"mode\",\"?\")}|{d[\"exitReason\"]}|{d[\"adversaryIterations\"]}|{d[\"latencyMs\"]}|{len(gs.get(\"performance_goals\",[]))}|{len(gs.get(\"inferred_requirements\",[]))}|{len(gs.get(\"gaps\",[]))}|{len(gs.get(\"conflicts\",[]))}|{len(bps)}|{\",\".join(bps) if bps else \"none\"}|{grounded}|{inference}|{svc_mentions}|{gs.get(\"domain\",\"?\")}|{len(gs.get(\"summary\",\"\"))}")
'

# ── Test cases ────────────────────────────────────────────────────────────────
# Format: ID|Category|Input
# Categories:
#   MATCH    = direct blueprint match exists
#   PARTIAL  = related blueprints exist but not exact
#   NOVEL    = no blueprint coverage
#   VAGUE    = minimal input, tests inference capability

declare -a TESTS=(
  # MATCH — direct blueprint coverage
  "TC-M1|MATCH|build a RAG pipeline for enterprise document search"
  "TC-M2|MATCH|deploy a customer service chatbot with AI"
  "TC-M3|MATCH|build a multi-agent system for retail e-commerce"
  # PARTIAL — related blueprints, not exact
  "TC-P1|PARTIAL|build a real-time fraud detection system for banking"
  "TC-P2|PARTIAL|create an AI-powered drug discovery pipeline"
  "TC-P3|PARTIAL|deploy a recommendation engine for a streaming platform"
  # NOVEL — no blueprint coverage
  "TC-N1|NOVEL|build an autonomous drone navigation system with computer vision"
  "TC-N2|NOVEL|create an AI-powered climate modeling simulation"
  # VAGUE — minimal input
  "TC-V1|VAGUE|chatbot"
  "TC-V2|VAGUE|optimize inference"
)

run_test() {
  local id="$1"
  local category="$2"
  local input="$3"
  local mode="$4"

  echo -n "  $id ($category) [$mode]... "

  RESULT=$(curl -s --max-time 360 -X POST "${BASE}?mode=${mode}&draft=true" \
    -H "Content-Type: application/json" \
    -d "{\"input\": \"$input\"}" 2>&1)

  PARSED=$(echo "$RESULT" | python -c "$PARSE_SCRIPT" 2>&1)
  STATUS=$(echo "$PARSED" | cut -d'|' -f1)

  if [ "$STATUS" = "OK" ]; then
    echo "$PARSED"
  elif [ "$STATUS" = "API_ERROR" ]; then
    echo "FAIL: $(echo "$PARSED" | cut -d'|' -f2)"
  else
    echo "FAIL: $PARSED"
  fi

  echo "$id|$category|$input|$PARSED" >> "$OUTDIR/raw-${mode}.txt"
}

echo "=============================================="
echo " Stage 1 Pipeline — Comprehensive Test Suite"
echo " $(date)"
echo "=============================================="
echo ""
echo "Header: STATUS|mode|exitReason|rounds|latencyMs|perfGoals|inferredReqs|gaps|conflicts|blueprintsMatched|bpNames|groundedChallenges|inferenceChallenges|nvidiaServiceMentions|domain|summaryLen"
echo ""

if [ "$MODE" = "both" ] || [ "$MODE" = "default" ]; then
  echo ">>> GROUNDED DEFAULT MODE (draft-only for speed)"
  echo "----------------------------------------------"
  for test in "${TESTS[@]}"; do
    IFS='|' read -r id category input <<< "$test"
    run_test "$id" "$category" "$input" "default"
  done
  echo ""
fi

if [ "$MODE" = "both" ] || [ "$MODE" = "baseline" ]; then
  echo ">>> BASELINE MODE (draft-only for speed)"
  echo "----------------------------------------------"
  for test in "${TESTS[@]}"; do
    IFS='|' read -r id category input <<< "$test"
    run_test "$id" "$category" "$input" "baseline"
  done
  echo ""
fi

echo "=== DONE ==="
echo "Raw results saved to $OUTDIR/"
