"""Test the GoalSpec → services mapper by getting a GoalSpec from Stage 1 and checking what services it would select."""
import json, urllib.request, time

BASE = "http://localhost:3099"
GOAL = "help doctors make better decisions at hospitals"

print(f"Goal: {GOAL}")
print("Getting GoalSpec from Stage 1...")
req = urllib.request.Request(
    f"{BASE}/api/analyze-requirements?draft=true",
    data=json.dumps({"input": GOAL}).encode(),
    headers={"Content-Type": "application/json"}
)
with urllib.request.urlopen(req, timeout=120) as resp:
    d = json.loads(resp.read())

gs = d["goalSpec"]
print(f"\nGoalSpec ready ({d['latencyMs']//1000}s)")
print(f"  domain: {gs['domain']}")
print(f"  use_case_type: {gs['use_case_type']}")
print(f"  compliance: {gs['constraints']['compliance']}")
print(f"  perfGoals: {len(gs['performance_goals'])}")
for p in gs['performance_goals']:
    print(f"    {p['metric']}: {p['target']}")
print(f"  inferredReqs: {len(gs['inferred_requirements'])}")
for r in gs['inferred_requirements']:
    print(f"    - {r['requirement'][:80]}")
print(f"  gaps: {len(gs['gaps'])}")
print(f"  conflicts: {len(gs['conflicts'])}")

# Now manually apply the mapping logic (same as goalspec-to-services.ts)
all_text = f"{gs['domain']} {gs['use_case_type']} {gs['summary']} {' '.join(r['requirement'] for r in gs['inferred_requirements'])} {' '.join(g['suggestion'] for g in gs['gaps'])}".lower()
perf_text = ' '.join(f"{p['metric']} {p['target']} {p['rationale']}" for p in gs['performance_goals']).lower()

import re
selected = {}

# Access
selected['ngc'] = 'Entry point'

# Hardware
hw = gs['constraints'].get('hardware','').lower()
if any(k in hw for k in ['dgx','cluster','multi-node']):
    selected['dgx-cloud'] = f'Hardware: {gs["constraints"]["hardware"]}'

# SDK
if re.search(r'computer vision|custom kernel|cuda|gpu programming', all_text):
    selected['cuda'] = 'GPU computing'
if re.search(r'cnn|convolutional|deep learning training|object detection', all_text):
    selected['cudnn'] = 'Deep learning primitives'

# Framework
if re.search(r'fine.?tun|train|custom model|pre.?train|adapt|rlhf|domain.?specif', all_text):
    selected['nemo'] = 'Training/fine-tuning'
if re.search(r'data prep|data quality|dataset|curate|clean.*data|de.?identif', all_text):
    selected['nemo-curator'] = 'Data preparation'
if 'nemo' in selected and 'nemo-curator' not in selected and re.search(r'train|fine.?tun', all_text):
    selected['nemo-curator'] = 'Data prep before training'
if re.search(r'rag|retriev|search|knowledge base|document|vector|embedding.*search|question.*answer', all_text):
    selected['nemo-retriever'] = 'Retrieval/RAG'
if gs['constraints']['compliance']:
    selected['nemo-guardrails'] = f'Compliance: {", ".join(gs["constraints"]["compliance"])}'
elif re.search(r'guardrail|safety|content moderat', all_text):
    selected['nemo-guardrails'] = 'Safety guardrails'
if re.search(r'evaluat|benchmark|accuracy|test set|validation|clinical.*accur', all_text) or re.search(r'evaluat|benchmark|accuracy', perf_text):
    selected['nemo-evaluator'] = 'Evaluation/benchmarking'
if any(re.search(r'accuracy|recall|precision|f1', p['metric'].lower()) for p in gs['performance_goals']):
    selected.setdefault('nemo-evaluator', 'Accuracy perf goal needs evaluation')
if re.search(r'tabular|feature engineer|fraud.*detect|structured data', all_text):
    selected['rapids'] = 'Tabular data processing'

# Agent
if re.search(r'agent|agentic|multi.?agent|orchestrat|autonom', all_text):
    selected['nemo-agent-toolkit'] = 'Agentic orchestration'

# Serving
if re.search(r'tensorrt.?llm|llm.*optim|optim.*inference', all_text) or any(re.search(r'latency|throughput|req/s|token', f"{p['metric']} {p['target']}".lower()) for p in gs['performance_goals']):
    selected['tensorrt-llm'] = 'LLM inference optimization'
if re.search(r'quantiz|compress|model.*optim', all_text):
    selected['model-optimizer'] = 'Model compression'
if re.search(r'triton|production.*serv|inference.*serv', all_text) or ('tensorrt-llm' in selected and re.search(r'production|deploy|scale', all_text)):
    selected['triton'] = 'Production serving'
if re.search(r'deploy|serv|inference|endpoint|api|microservice', all_text) or 'nemo-retriever' in selected or 'tensorrt-llm' in selected:
    selected['nim'] = 'Deployment'

# Enterprise
if re.search(r'enterprise|production|commercial|sla|mission.?critical', all_text) or len(gs['constraints']['compliance']) >= 2 or re.search(r'production|enterprise', gs['constraints'].get('scale','').lower()):
    selected['ai-enterprise'] = 'Enterprise support'

print(f"\n=== Mapped Services ({len(selected)}) ===")
for svc, reason in selected.items():
    print(f"  {svc}: {reason}")
