"""
Comprehensive test suite for Stage 1 pipeline.
Tests both baseline and grounded default modes across diverse enterprise use cases.

Usage: python scripts/run_tests.py [mode]
  mode: "baseline", "default", or "both" (default: both)
"""

import json
import sys
import time
import urllib.request
import os

BASE = "http://localhost:3099/api/analyze-requirements"

# ── Test cases ────────────────────────────────────────────────────────────────
# (id, category, input)
# Categories:
#   MATCH   = direct blueprint match exists
#   PARTIAL = related blueprints exist but not exact
#   NOVEL   = no blueprint coverage
#   VAGUE   = minimal input, tests inference capability

TESTS = [
    # MATCH — direct blueprint coverage
    ("TC-M1", "MATCH", "build a RAG pipeline for enterprise document search"),
    ("TC-M2", "MATCH", "deploy a customer service chatbot with AI"),
    ("TC-M3", "MATCH", "build a multi-agent system for retail e-commerce"),
    # PARTIAL — related blueprints, not exact
    ("TC-P1", "PARTIAL", "build a real-time fraud detection system for banking"),
    ("TC-P2", "PARTIAL", "create an AI-powered drug discovery pipeline"),
    ("TC-P3", "PARTIAL", "deploy a recommendation engine for a streaming platform"),
    # NOVEL — no blueprint coverage
    ("TC-N1", "NOVEL", "build an autonomous drone navigation system with computer vision"),
    ("TC-N2", "NOVEL", "create an AI-powered climate modeling simulation"),
    # VAGUE — minimal input
    ("TC-V1", "VAGUE", "chatbot"),
    ("TC-V2", "VAGUE", "optimize inference"),
]

NVIDIA_SERVICES = [
    "nim", "nemo", "tensorrt", "triton", "nemotron", "guardrails",
    "retriever", "curator", "rapids", "megatron", "cuopt", "blueprints",
]


def run_test(test_id, category, user_input, mode):
    url = f"{BASE}?mode={mode}&draft=true"
    payload = json.dumps({"input": user_input}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=360) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        return {"status": "ERROR", "error": str(e)[:120], "test_id": test_id, "category": category, "mode": mode}

    if "error" in data:
        return {"status": "API_ERROR", "error": data["error"], "detail": data.get("detail", "")[:120],
                "test_id": test_id, "category": category, "mode": mode}

    gs = data["goalSpec"]
    gt = data.get("groundTruth", {})
    bps = gt.get("blueprintsMatched", [])

    # Count NVIDIA service mentions in inferred requirements
    svc_mentions = 0
    for ir in gs.get("inferred_requirements", []):
        txt = ir.get("requirement", "").lower()
        if any(s in txt for s in NVIDIA_SERVICES):
            svc_mentions += 1

    return {
        "status": "OK",
        "test_id": test_id,
        "category": category,
        "input": user_input,
        "mode": data.get("mode", mode),
        "exit_reason": data.get("exitReason", "?"),
        "rounds": data.get("adversaryIterations", 0),
        "latency_ms": data.get("latencyMs", 0),
        "latency_s": round(data.get("latencyMs", 0) / 1000, 1),
        "perf_goals": len(gs.get("performance_goals", [])),
        "inferred_reqs": len(gs.get("inferred_requirements", [])),
        "gaps": len(gs.get("gaps", [])),
        "conflicts": len(gs.get("conflicts", [])),
        "blueprints_matched": len(bps),
        "blueprint_names": bps,
        "domain_template": data.get("domainTemplateUsed"),
        "nvidia_svc_mentions": svc_mentions,
        "domain": gs.get("domain", "?"),
        "summary_len": len(gs.get("summary", "")),
        "perf_goal_details": [f"{p['metric']}: {p['target']}" for p in gs.get("performance_goals", [])],
    }


def print_result(r):
    if r["status"] != "OK":
        print(f"  {r['test_id']} ({r['category']}) [{r['mode']}] — FAIL: {r.get('error', 'unknown')}")
        return

    print(f"  {r['test_id']} ({r['category']}) [{r['mode']}]")
    print(f"    latency: {r['latency_s']}s | domain: {r['domain']}")
    print(f"    perfGoals: {r['perf_goals']} | inferredReqs: {r['inferred_reqs']} | gaps: {r['gaps']} | conflicts: {r['conflicts']}")
    print(f"    blueprints: {r['blueprints_matched']} ({', '.join(r['blueprint_names']) if r['blueprint_names'] else 'none'})")
    print(f"    template: {r['domain_template'] or 'none'} | nvidiaServiceMentions: {r['nvidia_svc_mentions']}")


def run_suite(mode):
    print(f"\n>>> {mode.upper()} MODE (draft-only)")
    print("-" * 60)
    results = []
    for test_id, category, user_input in TESTS:
        print(f"  Running {test_id}...", end="", flush=True)
        t0 = time.time()
        r = run_test(test_id, category, user_input, mode)
        elapsed = time.time() - t0
        print(f" done ({elapsed:.0f}s)")
        print_result(r)
        print()
        results.append(r)
        # Small delay to avoid rate limiting
        time.sleep(2)
    return results


def print_comparison(default_results, baseline_results):
    print("\n" + "=" * 80)
    print(" COMPARISON: GROUNDED DEFAULT vs BASELINE")
    print("=" * 80)

    header = f"{'TC':<8} {'Cat':<8} {'Mode':<10} {'Latency':>8} {'PGoals':>7} {'InfReq':>7} {'Gaps':>5} {'Conf':>5} {'BPs':>4} {'SvcMnt':>7} {'Template':<10}"
    print(header)
    print("-" * len(header))

    for dr, br in zip(default_results, baseline_results):
        if dr["status"] == "OK":
            print(f"{dr['test_id']:<8} {dr['category']:<8} {'default':<10} {dr['latency_s']:>7.0f}s {dr['perf_goals']:>7} {dr['inferred_reqs']:>7} {dr['gaps']:>5} {dr['conflicts']:>5} {dr['blueprints_matched']:>4} {dr['nvidia_svc_mentions']:>7} {dr.get('domain_template','none') or 'none':<10}")
        else:
            print(f"{dr['test_id']:<8} {dr['category']:<8} {'default':<10} {'FAIL':>8}")

        if br["status"] == "OK":
            print(f"{'':8} {'':8} {'baseline':<10} {br['latency_s']:>7.0f}s {br['perf_goals']:>7} {br['inferred_reqs']:>7} {br['gaps']:>5} {br['conflicts']:>5} {br['blueprints_matched']:>4} {br['nvidia_svc_mentions']:>7} {br.get('domain_template','none') or 'none':<10}")
        else:
            print(f"{'':8} {'':8} {'baseline':<10} {'FAIL':>8}")
        print()

    # Aggregate stats
    ok_default = [r for r in default_results if r["status"] == "OK"]
    ok_baseline = [r for r in baseline_results if r["status"] == "OK"]

    if ok_default and ok_baseline:
        print("\n--- AGGREGATES ---")
        for label, data in [("Default", ok_default), ("Baseline", ok_baseline)]:
            avg_lat = sum(r["latency_s"] for r in data) / len(data)
            avg_pg = sum(r["perf_goals"] for r in data) / len(data)
            avg_ir = sum(r["inferred_reqs"] for r in data) / len(data)
            avg_gaps = sum(r["gaps"] for r in data) / len(data)
            avg_svc = sum(r["nvidia_svc_mentions"] for r in data) / len(data)
            success = len(data)
            print(f"  {label:10} | success: {success}/{len(TESTS)} | avg latency: {avg_lat:.0f}s | avg perfGoals: {avg_pg:.1f} | avg inferredReqs: {avg_ir:.1f} | avg gaps: {avg_gaps:.1f} | avg svcMentions: {avg_svc:.1f}")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "both"

    print("=" * 60)
    print(" Stage 1 Pipeline — Comprehensive Test Suite")
    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f" Mode: {mode}")
    print("=" * 60)

    outdir = "docs/test-results"
    os.makedirs(outdir, exist_ok=True)

    default_results = []
    baseline_results = []

    if mode in ("both", "default"):
        default_results = run_suite("default")
        with open(f"{outdir}/results-default.json", "w") as f:
            json.dump(default_results, f, indent=2)

    if mode in ("both", "baseline"):
        baseline_results = run_suite("baseline")
        with open(f"{outdir}/results-baseline.json", "w") as f:
            json.dump(baseline_results, f, indent=2)

    if mode == "both" and default_results and baseline_results:
        print_comparison(default_results, baseline_results)

    print("\nResults saved to docs/test-results/")


if __name__ == "__main__":
    main()
