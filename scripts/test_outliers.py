"""Test outlier cases against the clean baseline architecture."""
import json, time, urllib.request

BASE = "http://localhost:3099/api/analyze-requirements"

OUTLIERS = [
    ("TC-N1", "NOVEL", "build an autonomous drone navigation system with computer vision"),
    ("TC-N2", "NOVEL", "create an AI-powered climate modeling simulation"),
    ("TC-V1", "VAGUE", "chatbot"),
    ("TC-P2", "PARTIAL", "create an AI-powered drug discovery pipeline"),
]

# Previous baseline results for comparison
PREV_BASELINE = {
    "TC-N1": {"perf_goals": 5, "inferred_reqs": 4, "gaps": 4, "conflicts": 2, "latency_s": 105.1, "svc": 0},
    "TC-N2": {"perf_goals": 4, "inferred_reqs": 4, "gaps": 4, "conflicts": 2, "latency_s": 79.7, "svc": 0},
    "TC-V1": {"perf_goals": 4, "inferred_reqs": 3, "gaps": 4, "conflicts": 1, "latency_s": 126.1, "svc": 1},
    "TC-P2": {"perf_goals": 4, "inferred_reqs": 3, "gaps": 3, "conflicts": 2, "latency_s": 151.4, "svc": 1},
}

NVIDIA_SERVICES = ["nim","nemo","tensorrt","triton","nemotron","guardrails","retriever","curator","rapids","megatron","cuopt","blueprints"]

def run(tc_id, category, user_input):
    url = f"{BASE}?draft=true"
    payload = json.dumps({"input": user_input}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=360) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}

print("=" * 70)
print(" Outlier Test — Clean Baseline vs Previous Baseline")
print("=" * 70)
print()

for tc_id, cat, inp in OUTLIERS:
    print(f"Running {tc_id} ({cat})...", end="", flush=True)
    t0 = time.time()
    d = run(tc_id, cat, inp)
    elapsed = time.time() - t0
    print(f" done ({elapsed:.0f}s)")

    if "error" in d:
        print(f"  FAIL: {d['error'][:100]}")
        print()
        continue

    gs = d["goalSpec"]
    svc = sum(1 for ir in gs.get("inferred_requirements",[]) if any(s in ir.get("requirement","").lower() for s in NVIDIA_SERVICES))
    lat = d["latencyMs"] / 1000

    prev = PREV_BASELINE[tc_id]

    print(f"  domain: {gs['domain']}")
    print(f"  {'Metric':<20} {'Clean':>8} {'Prev':>8} {'Delta':>8}")
    print(f"  {'-'*48}")

    for label, curr_val, prev_val in [
        ("perfGoals", len(gs.get("performance_goals",[])), prev["perf_goals"]),
        ("inferredReqs", len(gs.get("inferred_requirements",[])), prev["inferred_reqs"]),
        ("gaps", len(gs.get("gaps",[])), prev["gaps"]),
        ("conflicts", len(gs.get("conflicts",[])), prev["conflicts"]),
        ("svcMentions", svc, prev["svc"]),
        ("latency(s)", lat, prev["latency_s"]),
    ]:
        delta = curr_val - prev_val
        sign = "+" if delta > 0 else ""
        print(f"  {label:<20} {curr_val:>8.1f} {prev_val:>8.1f} {sign}{delta:>7.1f}")

    print(f"\n  perfGoals:")
    for pg in gs.get("performance_goals",[]):
        print(f"    - {pg['metric']}: {pg['target']}")
    print()
    time.sleep(2)

print("Done.")
