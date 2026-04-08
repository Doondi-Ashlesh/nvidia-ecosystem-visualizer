# Skill 01 — Types & Data

**Files:** `types/ecosystem.ts`, `data/nvidia.ts`, `lib/workflow.ts`

---

## What it does

Defines the complete TypeScript type system and the NVIDIA service/workflow dataset. Every node shown on the graph, every workflow path, and every connection edge is described here. **All service data is sourced exclusively from official NVIDIA documentation** — no invented or inferred content.

---

## Types (`types/ecosystem.ts`)

### `Layer`
Six official levels of the NVIDIA AI stack, displayed as columns left → right:
```
access → sdk → framework → agent → serving → enterprise
```

### `AppMode`
Drives the global visual state of the app:
- `'initial'` — sidebar question is active; all columns are dimmed
- `'explore'` — all columns fully lit; hover shows service detail in sidebar
- `'workflow'` — a goal path is active; highlighted nodes guide the user

### `Service`
```typescript
{
  id: string;              // kebab-case, e.g. 'nemo-agent-toolkit'
  name: string;            // Official NVIDIA product name
  shortDescription: string; // 1 sentence shown on hexagon
  fullDescription: string; // Official description shown in sidebar
  officialUrl: string;     // Direct link to official NVIDIA page
  layer: Layer;
  tags: string[];
  connections: string[];   // Officially documented connections to other service IDs
}
```
Note: `position` was removed — layout is now determined by layer column order, not React Flow coordinates.

### `LAYER_COLORS` / `LAYER_LABELS` / `LAYER_SUBLABELS` / `LAYER_ORDER`
Constants driving column headers, hexagon colors, glow effects, and column ordering.

---

## NVIDIA Services (`data/nvidia.ts`) — 25 nodes across 6 layers

| Layer | Services |
|---|---|
| **access** | build.nvidia.com, NVIDIA Brev, NGC Catalog, DGX Cloud |
| **sdk** | CUDA Toolkit, cuDNN, TensorRT, TensorRT-LLM |
| **framework** | NVIDIA NeMo, NeMo Curator, NeMo Guardrails, NeMo Retriever, AI Workbench, RAPIDS |
| **agent** | NVIDIA Nemotron, NeMo Agent Toolkit, NVIDIA Blueprints ← NEW |
| **serving** | NVIDIA Dynamo-Triton, NIM Microservices |
| **enterprise** | NVIDIA AI Enterprise |

### New Agentic AI services (agent layer)

**NVIDIA Nemotron** (source: developer.nvidia.com/nemotron)
> "A family of open models with open weights, training data, and recipes for building specialized AI agents."
- Hybrid Mamba-Transformer MoE, 1M-token context, three reasoning tiers (Nano/Super/Ultra)
- Deploys via NIM, vLLM, SGLang, or Ollama

**NeMo Agent Toolkit** (source: official NeMo framework docs)
> "An open-source AI library that adds intelligence to AI agents across any framework."
- Works with LangChain, Google ADK, CrewAI, custom frameworks
- Agent Hyperparameter Optimizer, built-in evaluation, safety middleware for red-teaming

**NVIDIA Blueprints** (source: nvidia.com/en-us/ai/blueprints/)
> "Reference applications for generative AI use cases."
- Combines partner microservices, AI agents, sample code, and deployment documentation
- Covers customer service, video analytics, PDF-to-podcast, cybersecurity, manufacturing

---

## Workflows — 6 goal paths (data/nvidia.ts)

| # | Goal | Difficulty | Steps |
|---|---|---|---|
| 1 | Try AI models instantly | Beginner | 2 |
| 2 | Set up a GPU dev environment | Beginner | 3 |
| 3 | Fine-tune an LLM | Intermediate | 5 |
| 4 | Deploy LLM inference at scale | Intermediate | 5 |
| 5 | Build a RAG application | Advanced | 5 |
| 6 | Build an Agentic AI system | Advanced | 6 ← NEW |

### Workflow 6: Build an Agentic AI system
`brev → nemo → nemotron → nemo-agent-toolkit → nim → blueprints`

---

## Keyword matching (`data/nvidia.ts` — `matchWorkflows`)

```typescript
export function matchWorkflows(query: string, workflows: Workflow[]): Workflow[]
```
Simple keyword matching. Maps terms like "agent", "agentic", "orchestrate" to the `build-agent` workflow. Returns all workflows when query is empty (default state).

---

## How to verify

```typescript
import { NVIDIA_SERVICES, NVIDIA_WORKFLOWS } from '@/data/nvidia';

console.log(NVIDIA_SERVICES.length);  // → 25
console.log(NVIDIA_WORKFLOWS.length); // → 6

// Verify agent layer
NVIDIA_SERVICES.filter(s => s.layer === 'agent').map(s => s.id)
// → ['nemotron', 'nemo-agent-toolkit', 'blueprints']

// No broken connection references
const ids = new Set(NVIDIA_SERVICES.map(s => s.id));
const broken = NVIDIA_SERVICES.flatMap(s => s.connections).filter(c => !ids.has(c));
console.log(broken); // → []
```
