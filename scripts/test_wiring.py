"""
Test: Does feeding a GoalSpec to Stage 3 produce a better service path
than feeding a raw goal string?

Runs the same input through:
1. Stage 3 with raw string (current behavior)
2. Stage 1 → Stage 3 with GoalSpec (new wired behavior)

Compares: number of services, which services, compliance injection, evaluation injection.
"""
import json, time, urllib.request, sys

BASE = "http://localhost:3099"

TESTS = [
    ("TC-2", "build a medical RAG chatbot for hospitals"),
    ("TC-N1", "build an autonomous drone navigation system with computer vision"),
    ("TC-V1", "chatbot"),
]

def api_call(url, payload, timeout=360):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)[:200]}

def extract_services(data):
    if "error" in data:
        return None
    steps = data.get("steps", [])
    return [s["serviceId"] for s in steps]

print("=" * 80)
print(" Stage 1 -> Stage 3 Wiring Comparison")
print(" Raw goal string vs Structured GoalSpec")
print("=" * 80)

for tc_id, goal in TESTS:
    print(f"\n{'='*60}")
    print(f" {tc_id}: {goal}")
    print(f"{'='*60}")

    # Test A: Raw string -> Stage 3
    print(f"\n  [A] Raw string -> /api/generate-flow ...", end="", flush=True)
    t0 = time.time()
    raw_result = api_call(f"{BASE}/api/generate-flow", {"goal": goal})
    print(f" done ({time.time()-t0:.0f}s)")

    raw_services = extract_services(raw_result)
    if raw_services is None:
        print(f"  FAIL: {raw_result.get('error','?')}")
    else:
        print(f"  Services ({len(raw_services)}): {' -> '.join(raw_services)}")
        print(f"  goalSpecUsed: {raw_result.get('goalSpecUsed', False)}")

    time.sleep(3)

    # Test B: Stage 1 (draft) -> Stage 3
    print(f"\n  [B] Stage 1 (draft) -> Stage 3 ...", end="", flush=True)
    t0 = time.time()

    # Step 1: Get GoalSpec from Stage 1
    spec_result = api_call(f"{BASE}/api/analyze-requirements?draft=true", {"input": goal})
    if "error" in spec_result:
        print(f" Stage 1 FAIL: {spec_result['error']}")
        continue

    goal_spec = spec_result["goalSpec"]
    spec_time = time.time() - t0
    print(f" spec ready ({spec_time:.0f}s)...", end="", flush=True)

    # Step 2: Feed GoalSpec to Stage 3
    wired_result = api_call(f"{BASE}/api/generate-flow", {"goalSpec": goal_spec})
    total_time = time.time() - t0
    print(f" done ({total_time:.0f}s total)")

    wired_services = extract_services(wired_result)
    if wired_services is None:
        print(f"  FAIL: {wired_result.get('error','?')}")
    else:
        print(f"  Services ({len(wired_services)}): {' -> '.join(wired_services)}")
        print(f"  goalSpecUsed: {wired_result.get('goalSpecUsed', False)}")

    # Comparison
    if raw_services and wired_services:
        print(f"\n  --- COMPARISON ---")
        print(f"  {'Metric':<25} {'Raw':>15} {'GoalSpec':>15}")
        print(f"  {'-'*55}")
        print(f"  {'Service count':<25} {len(raw_services):>15} {len(wired_services):>15}")

        raw_set = set(raw_services)
        wired_set = set(wired_services)
        only_raw = raw_set - wired_set
        only_wired = wired_set - raw_set
        shared = raw_set & wired_set

        print(f"  {'Shared services':<25} {len(shared):>15} {len(shared):>15}")
        if only_raw:
            print(f"  Only in Raw:    {', '.join(sorted(only_raw))}")
        if only_wired:
            print(f"  Only in GoalSpec: {', '.join(sorted(only_wired))}")

        # Check specific injections
        has_guardrails_raw = 'nemo-guardrails' in raw_set
        has_guardrails_wired = 'nemo-guardrails' in wired_set
        has_evaluator_raw = 'nemo-evaluator' in raw_set
        has_evaluator_wired = 'nemo-evaluator' in wired_set
        has_trt_raw = 'tensorrt-llm' in raw_set
        has_trt_wired = 'tensorrt-llm' in wired_set

        print(f"\n  {'Rule check':<25} {'Raw':>15} {'GoalSpec':>15}")
        print(f"  {'-'*55}")
        print(f"  {'nemo-guardrails':<25} {'YES' if has_guardrails_raw else 'no':>15} {'YES' if has_guardrails_wired else 'no':>15}")
        print(f"  {'nemo-evaluator':<25} {'YES' if has_evaluator_raw else 'no':>15} {'YES' if has_evaluator_wired else 'no':>15}")
        print(f"  {'tensorrt-llm':<25} {'YES' if has_trt_raw else 'no':>15} {'YES' if has_trt_wired else 'no':>15}")

        if goal_spec:
            print(f"\n  GoalSpec context fed to Stage 3:")
            print(f"    domain: {goal_spec.get('domain','?')}")
            print(f"    compliance: {goal_spec.get('constraints',{}).get('compliance',[])}")
            print(f"    perf_goals: {len(goal_spec.get('performance_goals',[]))}")
            print(f"    inferred_reqs: {len(goal_spec.get('inferred_requirements',[]))}")

    time.sleep(3)

print("\n\nDone.")
