"""TC-2 only: raw string vs GoalSpec service path comparison."""
import json, time, urllib.request

BASE = "http://localhost:3099"
GOAL = "build a medical RAG chatbot for hospitals"

def api_call(url, payload, timeout=360):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())

print("=" * 70)
print(" TC-2: build a medical RAG chatbot for hospitals")
print(" Raw string vs GoalSpec -> generate-flow")
print("=" * 70)

# Test A: Raw string
print("\n[A] Raw string -> /api/generate-flow ...", end="", flush=True)
t0 = time.time()
try:
    raw = api_call(f"{BASE}/api/generate-flow", {"goal": GOAL})
    print(f" done ({time.time()-t0:.0f}s)")
    raw_svcs = [s["serviceId"] for s in raw.get("steps", [])]
    print(f"  Services ({len(raw_svcs)}): {' -> '.join(raw_svcs)}")
    print(f"  goalSpecUsed: {raw.get('goalSpecUsed')}")
except Exception as e:
    print(f" FAIL: {e}")
    raw_svcs = []

time.sleep(3)

# Test B: Stage 1 draft -> Stage 3
print("\n[B] Stage 1 (draft) -> /api/generate-flow ...", end="", flush=True)
t0 = time.time()
try:
    spec_resp = api_call(f"{BASE}/api/analyze-requirements?draft=true", {"input": GOAL})
    gs = spec_resp["goalSpec"]
    print(f" spec ready ({time.time()-t0:.0f}s)", flush=True)
    print(f"  GoalSpec: domain={gs['domain']}, compliance={gs['constraints']['compliance']}")
    print(f"  perfGoals={len(gs['performance_goals'])}, inferredReqs={len(gs['inferred_requirements'])}")

    print("  Sending GoalSpec to generate-flow ...", end="", flush=True)
    wired = api_call(f"{BASE}/api/generate-flow", {"goalSpec": gs})
    print(f" done ({time.time()-t0:.0f}s total)")
    wired_svcs = [s["serviceId"] for s in wired.get("steps", [])]
    print(f"  Services ({len(wired_svcs)}): {' -> '.join(wired_svcs)}")
    print(f"  goalSpecUsed: {wired.get('goalSpecUsed')}")
except Exception as e:
    print(f" FAIL: {e}")
    wired_svcs = []

# Comparison
if raw_svcs and wired_svcs:
    raw_set = set(raw_svcs)
    wired_set = set(wired_svcs)
    print(f"\n{'='*70}")
    print(" COMPARISON")
    print(f"{'='*70}")
    print(f"  {'':25} {'Raw':>12} {'GoalSpec':>12}")
    print(f"  {'-'*49}")
    print(f"  {'Service count':25} {len(raw_svcs):>12} {len(wired_svcs):>12}")
    print(f"  {'nemo-guardrails':25} {'YES' if 'nemo-guardrails' in raw_set else 'no':>12} {'YES' if 'nemo-guardrails' in wired_set else 'no':>12}")
    print(f"  {'nemo-evaluator':25} {'YES' if 'nemo-evaluator' in raw_set else 'no':>12} {'YES' if 'nemo-evaluator' in wired_set else 'no':>12}")
    print(f"  {'nemo-retriever':25} {'YES' if 'nemo-retriever' in raw_set else 'no':>12} {'YES' if 'nemo-retriever' in wired_set else 'no':>12}")
    print(f"  {'tensorrt-llm':25} {'YES' if 'tensorrt-llm' in raw_set else 'no':>12} {'YES' if 'tensorrt-llm' in wired_set else 'no':>12}")
    print(f"  {'nim':25} {'YES' if 'nim' in raw_set else 'no':>12} {'YES' if 'nim' in wired_set else 'no':>12}")
    only_raw = raw_set - wired_set
    only_wired = wired_set - raw_set
    if only_raw: print(f"\n  Only in Raw: {', '.join(sorted(only_raw))}")
    if only_wired: print(f"  Only in GoalSpec: {', '.join(sorted(only_wired))}")
    if not only_raw and not only_wired: print(f"\n  Identical service sets")
