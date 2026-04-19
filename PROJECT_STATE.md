# NVIDIA Ecosystem Visualizer — Project State & Roadmap

> **Purpose:** Complete handoff document. If you're picking this up on a new Claude session or account, read this first. It covers what the app is, what's built, what's planned, and exactly where to start.

---

## What This App Is

A Next.js web app that helps developers navigate NVIDIA's AI ecosystem. The user describes a goal (e.g. "build a RAG chatbot") and the app uses NVIDIA's Nemotron model to generate a verified, ordered service path through NVIDIA's 25 AI services — then visualizes it as an interactive graph.

**The app is being evolved into a full AI dev bootstrapper** — from "which services?" to "here's a production-ready notebook and scaffolding you can run."

**Live stack:**
- Next.js 16 + React 19 + TypeScript
- React Flow (`@xyflow/react`) for graph visualization
- Framer Motion for animations
- Tailwind CSS (NVIDIA green `#76b900` brand theme)
- NVIDIA NIM API (`nvidia/nemotron-3-super-120b-a12b`) for AI generation
- NVIDIA Embedding NIM (`nvidia/nv-embedqa-e5-v5`) for skill retrieval
- OpenAI SDK (used as NIM-compatible client)

**Env vars needed:**
```
NVIDIA_API_KEY=       # Required — NVIDIA NIM API key
NIM_REASONING=true    # Optional — enables Nemotron chain-of-thought
GITHUB_TOKEN=         # Optional — for live skills catalog refresh
```

---

## Current File Structure

```
/
├── app/
│   ├── layout.tsx              Root layout
│   ├── page.tsx                Main page — wires all state together
│   └── api/
│       ├── analyze-requirements/
│       │   └── route.ts        POST /api/analyze-requirements — Stage 1 (planner/adversary loop)
│       ├── generate-flow/
│       │   └── route.ts        POST /api/generate-flow — Stage 3 (stack selection)
│       └── export-notebook/
│           └── route.ts        POST /api/export-notebook — Stage 5 partial (notebook download)
├── components/
│   ├── Sidebar.tsx             Left panel (goal input, step nav, explore detail)
│   ├── EcosystemGraph.tsx      React Flow graph (25 nodes, edges, pan/zoom)
│   ├── ServiceNode.tsx         Hex-shaped service node
│   ├── NodeTooltip.tsx         Hover tooltip
│   ├── Header.tsx              Top nav bar
│   ├── GoalPanel.tsx           Goal entry display
│   ├── NodeDetailPanel.tsx     Service detail in explore mode
│   ├── WorkflowSidebar.tsx     Step navigator in workflow mode
│   ├── LayerColumn.tsx         Layer column header
│   ├── EcosystemColumns.tsx    Column layout wrapper
│   ├── ServiceHex.tsx          Hex component
│   └── WaveDivider.tsx         Decorative divider
├── data/
│   ├── nvidia.ts               25 NVIDIA services + connections + metadata
│   └── skills-catalog.ts       Static agent skills baseline (333 entries)
├── lib/
│   ├── skills-retriever.ts     NeMo Retriever: embed goal → cosine sim → top-K skills
│   ├── workflow.ts             Workflow utilities
│   └── workflow-notebook.ts    Jupyter notebook builder (nbformat 4)
├── types/
│   └── ecosystem.ts            All TypeScript types (incl. GoalSpec, PerformanceGoal, etc.)
└── docs/skills/                Internal component documentation (01–07)
```

---

## How The App Works Today (End-to-End)

### Three modes

**Initial mode** — User types a goal, hits send
**Workflow mode** — Graph highlights the AI-generated service path, user steps through it
**Explore mode** — Free browsing, click any service to see details

### The AI pipeline (current)

```
User goal (string)
  → lib/skills-retriever.ts
      Embeds goal via nvidia/nv-embedqa-e5-v5
      Cosine similarity against skills catalog
      Returns top-5 relevant skills
  → app/api/generate-flow/route.ts
      Builds prompt: service list + 12 hard rules + retrieved skills
      Calls nvidia/nemotron-3-super-120b-a12b
      Server-side safety net: enforces layer ordering, injects mandatory services
      Returns: { verified, steps[], reasoning, latencyMs }
  → EcosystemGraph.tsx
      Renders highlighted path
  → Sidebar.tsx
      Shows step navigator + reasoning panel
```

### The 6 service layers (left → right in graph)
`access → sdk → framework → agent → serving → enterprise`

### Key types
```typescript
Service       { id, name, shortDescription, fullDescription, officialUrl, layer, tags, connections, skills? }
WorkflowStep  { serviceId, role, action, inputs?, outputs? }
Workflow      { id, goal, description, difficulty, steps[] }
Skill         { name, version, description, repoUrl }
AppMode       'initial' | 'goalspec' | 'explore' | 'workflow'
GoalSpec      { domain, use_case_type, performance_goals[], constraints, inferred_requirements[], gaps[], conflicts[], summary }
```

---

## What's Built (Branch: `feature/nvidia-nim-nemotron`)

**All work is consolidated on this branch.** Last updated: 2026-04-13.

### Complete Pipeline: GoalSpec → Path → Scaffolding → Notebook → Export

```
User goal → Stage 1 (GoalSpec + adversary) → Stage 2 (service path) → Scaffolding (templated) → Notebook (LLM + grounding) → Zip download
```

### Stage 1 — GoalSpec + Adversary Loop ✅ DONE
- `POST /api/analyze-requirements`
- Planner (120B) generates GoalSpec from raw input → Adversary challenges → Planner resolves → loop until converged
- Convergence detection: stagnation, timeout (4min), hard cap (5 rounds)
- `<think>` tag parsing, `nimJsonCall()` retry with JSON repair
- `?draft=true` skips adversary loop (~60-90s)
- Output: domain, compliance[], performance_goals[], constraints, inferred_requirements[], gaps[], conflicts[], summary
- Tested across 10 enterprise use cases (healthcare, fraud, logistics, drug discovery, drones, climate, chatbot, recommendation, e-commerce, inference)

### Stage 2 — Service Path (Data-Flow Prompt) ✅ DONE
- `POST /api/generate-flow`
- 3-sentence data-flow prompt — model describes inputs/outputs per service
- Accepts `{ goal }` OR `{ goalSpec }` from Stage 1 (backward compatible)
- `buildGoalSpecPrompt()` converts GoalSpec to structured prompt context
- Deduplicates services, sorts by layer order, validates serviceIds
- 9/10 avg quality across 7 test cases. Zero hardcoded rules.
- Correctly differentiates: healthcare (TensorRT, Guardrails) vs fraud (TensorRT, no Guardrails) vs logistics (cuOpt, no LLM)

### Stage 3 — Scaffolding (Zero LLM) ✅ DONE
- `POST /api/generate-scaffolding`
- `lib/scaffolding-templates.ts` — pure templating from GoalSpec + path data
- Generates: PRD.md, stack.md, architecture.md, features/*.md, CLAUDE.md, AGENTS.md
- Instant — zero LLM calls, zero latency
- Frontend: "Docs" button at bottom-left of graph downloads scaffolding zip

### Stage 4 — Notebook Generation (LLM + Code Grounding) ✅ DONE
- `POST /api/generate-notebook`
- `lib/notebook-patterns.ts` — 12 real NVIDIA code patterns from official GitHub repos
- Grounding proved: 5.5/10 without → 8.5/10 with (correct SDK APIs instead of hallucinated)
- Patterns: nemo_curator Pipeline, nemoguardrails LLMRails, modelopt mtq.quantize, tritonclient, OpenAI SDK for NIM, cudf, nemo-evaluator-launcher CLI, TensorRT trtexec, etc.
- `lib/workflow-notebook.ts` — NotebookCell/JupyterNotebook types + buildNotebookJson helper
- Frontend: "Download Jupyter notebook" button in sidebar workflow mode

### Stage 5 — Zip Export ✅ DONE
- `lib/export-zip.ts` — client-side zip packaging using fflate
- Frontend: "Export All" button at bottom-left of graph
- Downloads: docs/ + notebook.ipynb + CLAUDE.md + AGENTS.md as single zip
- Calls scaffolding (instant) + notebook (LLM, 3-5 min) → packages together

### Frontend Pipeline Flow ✅ WIRED
- `app/page.tsx` — GoalSpec state, mode transitions (initial → goalspec → workflow)
- `components/Sidebar.tsx` — 3-stage flow:
  1. `handleAnalyze()` → `/api/analyze-requirements` → GoalSpec display panel
  2. `handleConfirmGoalSpec()` → `/api/generate-flow` with GoalSpec → graph highlights path
  3. `handleExportNotebook()` → `/api/generate-notebook` → .ipynb download
- Export buttons at bottom-left of graph: "Docs" (scaffolding only) + "Export All" (docs + notebook)
- GoalSpec panel shows: domain, compliance badges, performance goals, inferred requirements, gaps

### Supporting Libraries
- `lib/ground-truth.ts` — fetches 15 NVIDIA blueprint repos (metadata extraction, not in default pipeline)
- `lib/skills-retriever.ts` + `data/skills-catalog.ts` — NeMo Retriever pattern (333 skills)
- `lib/workflow.ts` — graph visualization helpers

### What Was Tested and Removed (Data-Driven)
- Self-critique prompt — fewer perf goals than baseline (Exp 7)
- Domain template injection — wrong templates added noise (Exp 7)
- Asymmetric 49B adversary — false positives (Exp 3, 5)
- Ground truth in planner — confused model for novel domains (Exp 7)
- 13 hardcoded keyword rules — constrained model to 4 services (Exp 8)
- Adversary loop on path — added 200s for marginal improvement (Exp 8)

### Experimentation
- 8 experiments documented in `docs/EXPERIMENTATION.md`
- 10-case enterprise test suite in `scripts/run_tests.py`
- Key finding: data-flow prompt (inputs/outputs) naturally filters wrong services without rules

---

## Architecture Evolution (Data-Driven Decisions)

### The original problem
The initial Stage 3 used 13 hardcoded keyword rules to trigger services. "Hospital" → inject guardrails. "RAG" → exclude training stack. This produced 4-service paths (4/10 quality) because the model played it safe with all the restrictions.

### What we tried (8 experiments, 10 enterprise test cases)
1. Self-critique (single pass) — faster but fewer perf goals (Exp 4)
2. Domain templates — helped for exact matches, hurt for novel domains (Exp 5, 7)
3. Asymmetric models (49B adversary) — false positives, worse than 120B (Exp 3, 5)
4. Ground truth in planner — confused model on novel domains (Exp 6, 7)
5. "Include ALL" minimal prompt — 18 services, too noisy (Exp 8)
6. Scope calibration + justification — 6 services, too lean (Exp 8)
7. Production-ready + justification — 10 services, good but no natural filter (Exp 8)
8. **Data-flow prompt — 8-10 services, avg 8.7/10, zero wrong inclusions (Exp 8)** ← WINNER

### Key finding
**The 120B model doesn't need rules — it needs the right framing.** Asking for data flow (inputs/outputs) forces architectural thinking. Services that can't be placed in a concrete data flow get naturally excluded. This works for ANY domain without domain-specific rules.

**The fix:** Stage 1 of the new pipeline converts any vague input into a rich, specific performance goal before service selection runs. With rich input, the model reasons correctly without keyword crutches.

---

## The Planned Evolution: AI Dev Bootstrapper

### Reference Template

**NVIDIA's own `Retail-Agentic-Commerce` blueprint** (https://github.com/NVIDIA-AI-Blueprints/Retail-Agentic-Commerce) uses the exact doc structure we plan to generate:
```
docs/PRD.md
docs/stack.md
docs/architecture.md
docs/features.md
docs/features/feature-*.md
deploy/1_Deploy_Agentic_Commerce.ipynb
CLAUDE.md
AGENTS.md
```
Our pipeline output must structurally mirror this. It's the validated NVIDIA blueprint format.

### The 6-Stage Pipeline

```
Stage 1 — Intake + Goal Conversion + Adversary Review        ← START HERE
  Input:  vague goal OR full PRD document
  Step A: Nemotron converts to structured goal spec with performance targets
          NOT "build a search feature" → "semantic search with >85% recall@10, <200ms P95"
  Step B: Nemotron infers missing best-practice requirements
          User didn't mention evaluation? System adds it. User didn't mention guardrails
          for a healthcare app? System adds it. The system is the expert.
  Step C: Adversary agent (separate prompt, different role) challenges the plan:
          "What's missing? What will break? What assumption is wrong?"
          Planner resolves challenges. Output is the refined plan.
  Output: structured goal spec JSON with:
    - domain, use_case_type
    - performance_goals[] (each with metric + target value)
    - constraints (compliance, hardware, budget, scale)
    - inferred_requirements[] (things user didn't say but best practice demands)
    - gaps[] (missing info flagged)
    - conflicts[] (impossible combinations caught)

Stage 2 — Repo Research + NVIDIA Ground Truth
  Input:  Stage 1 goal spec + selected services
  Step A: Pull and summarize relevant NVIDIA repos
          (NeMo, NIM, Agent Toolkit, RAPIDS, Blueprints, etc.)
          Clone → have agent understand → create markdown summary as ground truth
          This solves the problem of new NVIDIA tools not being in pre-training data
  Step B: Embed NVIDIA's existing example notebooks for retrieval
          Real notebook cells become grounding for Stage 5 generation
  Output: repo summaries + retrievable notebook cells

Stage 3 — Stack Selection                    ← ALREADY EXISTS (/api/generate-flow)
  Input:  Stage 1 goal spec + Stage 2 context + skills catalog
  Output: verified ordered NVIDIA service path
  Note:   Feed Stage 1 rich output instead of raw user goal
          Most keyword rules in route.ts become redundant
          Only structural rules stay (layer ordering, intra-layer deps)

Stage 4 — Scaffolding Generation (spec files)
  Input:  Stages 1-3 outputs
  Output: complete scaffolding folder:
    docs/
      PRD.md              — what we're building and why, success criteria
      stack.md            — which NVIDIA services, in order, why each one
      architecture.md     — how services connect, data flow
      features.md         — system capabilities overview
      features/
        feature-a.md      — individual feature spec (sharded)
        feature-b.md
        ...
    CLAUDE.md             — Claude Code instructions (exact file structure, deps, impl order)
    AGENTS.md             — agent configuration
  Quality gate: self-eval against Stage 1 performance goals → refine (2-3 passes)
  Key insight: scaffolding quality determines one-shot success.
               If scaffolding is good enough, Claude Code one-shots the implementation.

Stage 5 — Notebook Generation               ← FLAGSHIP DELIVERABLE
  Input:  Stages 1-4 outputs + retrieved NVIDIA notebook cells from Stage 2
  Step A: Generate notebook grounded in real NVIDIA example cells
          NOT hallucinated code — recombined patterns from actual NVIDIA notebooks
          One section per service: markdown cell (role) + install cell + config/init code
  Step B: Self-evaluate notebook
          Feed back to Nemotron: "Are imports valid? Services ordered correctly?
          APIs match documented signatures? Missing any setup steps?"
  Step C: Iterate until evaluation passes (2-3 rounds max)
  Output: production-ready .ipynb that orchestrates all services end-to-end

Stage 6 — Export
  Output: downloadable zip containing:
    - All docs/ files (the shareable "intent" — Karpathy/OpenClaw concept)
    - The notebook (.ipynb)
    - CLAUDE.md (for Claude Code handoff)
    - AGENTS.md
  Key insight: the scaffolding IS the shareable artifact.
               Someone receives the zip, hands it to their AI agent, gets a working impl.
               Share intent, not code.
```

### New API Routes To Build
```
POST /api/analyze-requirements   Stage 1 — goal conversion + adversary review
POST /api/research-repos         Stage 2 — NVIDIA repo summarization + notebook embedding
POST /api/generate-specs         Stage 4 — scaffolding generation with self-eval
POST /api/generate-notebook      Stage 5 — notebook generation with self-eval loop
POST /api/export                 Stage 6 — zip all artifacts
```

Existing `/api/generate-flow` stays as Stage 3.

### UI Changes Needed
- Sidebar intake: multi-line PRD input (textarea already exists, needs expansion)
- Pipeline progress indicator showing which stage is running
- Spec file viewer: render generated MD files in-app with download buttons
- Notebook preview: show generated `.ipynb` cells before download
- Export all button: zip of all generated artifacts

---

## Implementation Order

| Priority | What | Why | Route |
|---|---|---|---|
| **P0** | Stage 1: goal conversion + adversary | Foundation — everything depends on this | `/api/analyze-requirements` |
| **P1** | Wire Stage 1 → Stage 3 | Make existing service selection use rich input | modify `/api/generate-flow` |
| **P1** | Stage 4: scaffolding generation | Highest visibility deliverable | `/api/generate-specs` |
| **P1** | Stage 5: notebook generation | Flagship deliverable (AMT's primary ask) | `/api/generate-notebook` |
| **P2** | Stage 2: NVIDIA repo grounding | Makes notebooks accurate, not hallucinated | `/api/research-repos` |
| **P2** | Self-eval loops (Stages 4+5) | Makes output production-quality | within existing routes |
| **P3** | Stage 6: export/share | Polish — zip download + shareable intent | `/api/export` |

---

## Key Design Decisions (Don't Reverse These)

1. **No fine-tuning needed.** Nemotron-Super-49B handles this pipeline without fine-tuning. Investment goes into prompting and grounding. Fine-tune later once real user outputs accumulate as training data.

2. **Stage 1 is the multiplier.** Don't add more keyword rules to `route.ts`. Rich input from Stage 1 → model reasons correctly on its own. Keyword rules are a crutch.

3. **Files are ground truth.** Generated spec files are the canonical artifact. Everything traces back to Stage 1 output.

4. **Skills catalog grounds notebooks.** Don't generate code from scratch — ground in `data/skills-catalog.ts` + `lib/skills-retriever.ts` + NVIDIA example notebooks (Stage 2).

5. **Structural rules stay, semantic rules go.** In `route.ts`, keep layer ordering and intra-layer dependency enforcement. Remove keyword-triggered service injections.

6. **Two-agent adversary pattern.** Stage 1 uses a planner + challenger. Challenger is a separate prompt (different role, ideally different model) that asks clarifying questions. Planner resolves them. This replaces human-in-the-loop for plan quality.

7. **Performance goals, not requirements.** Every requirement converts to a measurable target with a metric and threshold. This enables automated iteration — agent keeps trying until it hits the number.

8. **Mirror NVIDIA Blueprint structure.** Output folder structure matches `Retail-Agentic-Commerce`. PRD.md, stack.md, architecture.md, features.md + features/ folder, deploy notebook, CLAUDE.md, AGENTS.md.

9. **Scaffolding IS the product.** The zip of docs + notebook is the shareable artifact. Share intent, not code. Someone hands it to their AI agent and gets a working implementation.

---

## Where To Start On A Fresh Session

1. Read this file completely
2. Read `app/api/generate-flow/route.ts` — understand the current AI route
3. Read `lib/skills-retriever.ts` — understand the retrieval pattern
4. Read `types/ecosystem.ts` — understand the data structures
5. Read `data/nvidia.ts` briefly — know what services exist
6. Start building `app/api/analyze-requirements/route.ts` (Stage 1)

**The first thing to build is Stage 1's system prompt.** It needs to:
- Accept any input (one word to full PRD)
- Convert requirements to measurable performance goals (not "build X" → "achieve Y at Z threshold")
- Infer missing best-practice requirements the user didn't mention
- Detect gaps (missing info) and conflicts (impossible combinations)
- Run adversary pass: challenge the plan, resolve weaknesses
- Return structured JSON, not prose
- Use Nemotron reasoning mode (same pattern as generate-flow)

**Stage 1 output schema (target):**
```json
{
  "domain": "clinical decision support",
  "use_case_type": "real-time inference + retrieval",
  "performance_goals": [
    { "metric": "inference_latency_p95", "target": "<200ms", "rationale": "..." },
    { "metric": "retrieval_recall_at_10", "target": ">85%", "rationale": "..." }
  ],
  "constraints": {
    "compliance": ["HIPAA"],
    "hardware": "cloud GPU (A100/H100)",
    "scale": "multi-tenant, hospital-grade"
  },
  "inferred_requirements": [
    { "requirement": "output guardrails for medical safety", "reason": "healthcare domain requires explainable, safe outputs" },
    { "requirement": "model evaluation against clinical benchmarks", "reason": "medical AI must be benchmarked before deployment" }
  ],
  "gaps": [
    { "gap": "no training dataset specified", "suggestion": "specify data source or use synthetic data via NeMo Curator" }
  ],
  "conflicts": [],
  "summary": "Real-time clinical decision support system requiring sub-200ms inference over medical text with HIPAA compliance, output guardrails, and clinical benchmark evaluation."
}
```

---

## Detailed Feedback (PM + Sr DevRel Session, 2026-04-09)

### Speakers
- **AMT** = Antonio Martinez Torres (Sr DevRel, NVIDIA)
- **Jeremy Coupe** (DevRel, NVIDIA)
- **Doondi Ashlesh** (developer, presenter)

### AMT's Asks (verbatim-derived)

1. **Autonomously build a Jupyter notebook on the fly** that orchestrates everything highlighted — end-to-end solution, not just a visualization
2. **Use NVIDIA's existing notebooks as ground truth** — Jeremy's team builds notebooks for fine-tuning, RL, etc. Use those as embeddings/RAG source
3. **Self-evaluating notebook generation** — evaluate the generated notebook to make sure it works; if it doesn't, self-evolve and iterate until it passes
4. **Production-ready output** — the notebook should be the complete deliverable
5. **Multiple markdown files for the plan** — PRD.md, stack.md, architecture.md, features.md + feature sharding (folder with individual feature files)
6. **Pass the folder to an agent** — the plan folder enables Claude Code to build the full solution
7. **Two-agent adversary pattern** — Agent A builds the plan, Agent B (different model/role) acts as human asking clarifying questions. They iterate together. Reserve real human-in-the-loop for critical decisions only. "A really good concept we're using internally."
8. **Clone and summarize NVIDIA repos as ground truth** — new tools like NeMo Agent Toolkit aren't in pre-training data. Clone the repo, have Claude Code understand it, create a markdown summary, use that as ground truth in your project.

### Jeremy's Asks (verbatim-derived)

1. **Development plan that anticipates needs** — user provides vague goal, plan infers what's missing (evaluation, guardrails) and adds it. "You didn't mention evaluation but I think it should be in here."
2. **Plan as a stepping stone** — validate the plan before attempting a full software build. Cheaper to check than an hour-long vibe coding session.
3. **Scaffolding = CLAUDE.md + skills + custom commands + plan files** — if scaffolding is really well built, high chance of one-shotting the app
4. **One-shot challenges** — grade on one-shot execution. Only possible with great scaffolding.
5. **Karpathy concept: share intent not code** — share a gist of the idea, someone hands it to their agent, gets a working impl. The scaffolding IS the shareable format.
6. **Spec-driven development** — convert requirements into performance goals. Not "build this algorithm" → "develop an algorithm 30% better than this naive version." Performance goals trigger agent creativity and iteration.
7. **OpenClaw pattern** — "don't create a PR with code, create a PR with a prompt." The intent in natural language IS the deliverable.

### What "spectrovid development" Was
This was **"spec-driven development"** — Jeremy's term for converting requirements into performance-level goals that let the agent iterate autonomously.

---

## Where To Start On A Fresh Session

1. Read this file completely
2. Read `docs/EXPERIMENTATION.md` — understand what was tested and why decisions were made
3. Read `app/api/analyze-requirements/route.ts` — the Stage 1 pipeline (clean 3-pass architecture)
4. Read `app/api/generate-flow/route.ts` — Stage 3 stack selection
5. Read `types/ecosystem.ts` — all data structures including GoalSpec
6. Next work: Stage 4 (scaffolding generation), then Stage 5 (AI notebook generation), then Stage 6 (zip export)

---

## Git State

- **Main branch:** `master`
- **Working branch:** `feature/nvidia-nim-nemotron` (all work consolidated here)
- **Model:** `nvidia/nemotron-3-super-120b-a12b`
- **Last updated:** 2026-04-12 (Stage 1→3 wiring complete, data-flow prompt, 8 experiments)
- **To merge when ready:** `git checkout master && git merge feature/nvidia-nim-nemotron`
- **Note:** Old worktree branches (`claude/zealous-swartz`, etc.) are abandoned — all code lives on `feature/nvidia-nim-nemotron`

---

## Reference Repos

- **NVIDIA Retail Agentic Commerce Blueprint:** https://github.com/NVIDIA-AI-Blueprints/Retail-Agentic-Commerce
  - Uses: Nemotron-Nano-30B, NV-EmbedQA-E5-v5, NeMo Agent Toolkit, NIM, Milvus
  - Has: docs/PRD.md, stack.md, architecture.md, features.md, deploy notebook, CLAUDE.md
  - This is the structural template for our generated output

- **NVIDIA AI Blueprints (all):** https://github.com/NVIDIA-AI-Blueprints
  - 30 blueprint repos indexed in `lib/ground-truth.ts` (15 currently fetched)
  - Key blueprints: rag, ambient-healthcare-agents, ai-virtual-assistant, aiq, data-flywheel, safety-for-agentic-ai
