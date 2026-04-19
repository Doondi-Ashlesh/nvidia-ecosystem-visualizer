# NVIDIA AI Ecosystem Visualizer

> An interactive graph that maps NVIDIA’s AI product stack — describe your goal in plain English and **NVIDIA NIM** (Nemotron) generates a step-by-step path through the ecosystem, grounded in official docs and optional skill retrieval.

![Workflow Path](media/Screenshot%202026-04-02%20213152.png)

---

## What It Does

Developers approaching NVIDIA’s AI stack face a fragmented landscape — NIM, NeMo, Triton, TensorRT, Brev — with no map showing how they relate or where to start.

This tool solves that by:

- Visualising **25 official NVIDIA AI services** across **6 layers** as an interactive hexagonal graph
- Drawing **documented connection edges** between services (no invented relationships)
- Letting you describe any goal in plain English — **Nemotron** maps the right services in the correct layer order via **`/api/generate-flow`**
- **Skill grounding** — NVIDIA embedding NIM + cosine similarity over a static skills catalog (optional live refresh from GitHub)
- Highlighting your path on the graph with **animated edges + step-by-step guidance**
- **Explore mode** — click any node to see its official description and docs in the sidebar

---

## Screenshots

### AI-Generated Workflow Path

Describe a goal → Nemotron maps the exact NVIDIA services with roles and actions per step.

![AI Path — Fine-tune an LLM](media/Screenshot%202026-04-02%20213152.png)

---

### HUD Tooltip on Active Node

Hover any node during a workflow to see its official description and a direct link to NVIDIA docs.

![HUD Tooltip](media/Screenshot%202026-04-02%20213334.png)

---

### Explore Mode — Full Graph

Browse all services freely with full visibility. All connections visible at once.

![Explore Mode — Full Graph](media/Screenshot%202026-04-02%20213350.png)

---

### Explore Mode — Click a Node

Click any node to load its full official description, tags, and connections in the sidebar.

![Explore Mode — Node Detail](media/Screenshot%202026-04-02%20213453.png)

---

### Demo Video

https://github.com/Doondi-Ashlesh/nvidia-ecosystem-visualizer/raw/master/media/Demo.mp4

---

## Features

| Feature | Description |
|---|---|
| **AI Path Generator** | Type any AI goal — **Nemotron** on **NVIDIA NIM** returns a path with roles and actions; server-side rules enforce layer order and exclusions |
| **Strict layer ordering** | Paths flow `Access → SDK → Frameworks → Agentic AI → Serving → Enterprise` |
| **Cannot-verify fallback** | If no documented path exists, the API returns `verified: false` and suggested services instead of fabricating a path |
| **Interactive hex graph** | Pan, zoom, click — React Flow canvas with `smoothstep` connection arrows |
| **Game HUD tooltips** | Hover any node for a scanline-style panel with description, tags, and official docs link |
| **Layer zoom** | Hover a layer column header to zoom the canvas into that layer’s services |
| **Explore mode** | Browse every service freely — click a node for full description and connections |
| **Workflow step navigator** | Follow AI-generated paths step-by-step with auto-pan to each active node |
| **Reasoning panel** | Optional Nemotron chain-of-thought when returned by NIM |
| **Glassmorphism UI** | Hex nodes with blur + NVIDIA green glow on hover/active states |
| **Responsive** | Hamburger sidebar on mobile, abbreviated layer labels at tablet widths |

---

## Tech Stack

| | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Graph | @xyflow/react v12 |
| Animations | Framer Motion |
| AI | **OpenAI-compatible SDK** → **NVIDIA NIM** (`integrate.api.nvidia.com`) — chat: **Nemotron Super 49B**; embeddings: **nv-embedqa-e5-v5** |
| Icons | Lucide React |

---

## NVIDIA Services Covered

**25 services across 6 layers — sourced from official NVIDIA documentation** (see `data/nvidia.ts` for per-service links).

| Layer | Examples |
|---|---|
| **Access** | NVIDIA Build (build.nvidia.com), Brev, NGC Catalog, DGX Cloud |
| **SDK / Runtime** | CUDA Toolkit, cuDNN, TensorRT |
| **Frameworks** | NeMo, NeMo Curator / Guardrails / Retriever / Evaluator / Gym, AI Workbench, RAPIDS, Megatron-LM |
| **Agentic AI** | Nemotron, NeMo Agent Toolkit, NVIDIA AI Blueprints |
| **Serving** | Model Optimizer, TensorRT-LLM, Dynamo-Triton, NIM |
| **Enterprise** | NVIDIA AI Enterprise, cuOpt |

---

## Getting Started

### Prerequisites

- Node.js 18+
- An **[NVIDIA API key](https://build.nvidia.com)** (NIM) — used for chat completions and embeddings

### Installation

```bash
git clone https://github.com/Doondi-Ashlesh/nvidia-ecosystem-visualizer.git
cd nvidia-ecosystem-visualizer
npm install
```

### Environment

Create `.env.local` in the project root:

```env
NVIDIA_API_KEY=your_nvidia_api_key_here

# Self-hosted OpenAI-compatible NIM (e.g. Brev) — chat only; embeddings stay on integrate.api.nvidia.com
# NIM_BASE_URL=http://your-brev-ip:8000/v1
# NIM_CHAT_MODEL=your-served-model-id   # defaults to nvidia/nemotron-3-super-120b-a12b if unset

# Nemotron chain-of-thought (adds latency). Omit or set false for faster path generation.
# NIM_REASONING=true

# Optional: higher GitHub rate limits for live SKILL.md refresh
# GITHUB_TOKEN=ghp_...
```

**`NIM_REASONING`** — When unset, empty, `false`, or `0`, path generation **does not** send `reasoning mode ON` to Nemotron (default). Set to **`true`** or **`1`** to enable NVIDIA’s reasoning trace (often slower; the sidebar can show the reasoning panel when the model returns it).

**`NIM_BASE_URL` / `NIM_CHAT_MODEL`** — Point **chat completions** at a self-hosted NIM (must be OpenAI-compatible `/v1/chat/completions`). Skill **embeddings** in `lib/skills-retriever.ts` still use the shared NVIDIA API unless you change that file. If your Next.js app runs elsewhere (e.g. Vercel), the server must be able to **reach** your Brev URL (network, firewall, HTTPS).

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Doondi-Ashlesh/nvidia-ecosystem-visualizer&env=NVIDIA_API_KEY&envDescription=NVIDIA%20API%20key%20for%20NIM%20(path%20generation%20%2B%20embeddings)&envLink=https://build.nvidia.com)

1. Click the button above or import the repo at [vercel.com/new](https://vercel.com/new)
2. Add **`NVIDIA_API_KEY`** (and optionally **`GITHUB_TOKEN`**) in Project → Environment Variables
3. Deploy — Vercel auto-detects Next.js

---

## How the AI Path Generation Works

The **`/api/generate-flow`** route calls **NVIDIA NIM** with strict prompt rules and post-processing:

1. **Layer ordering** — steps follow `access → sdk → framework → agent → serving → enterprise`
2. **Documented connections only** — paths are constrained to the service list and rules in `route.ts`
3. **Skill retrieval** — top matching skills (from `data/skills-catalog.ts`) are embedded and injected into the prompt when retrieval succeeds
4. **Self-verification** — the model is asked to validate the path before returning JSON
5. **Server-side safety net** — invalid IDs stripped, exclusions filtered, layer order and mandatory co-inclusions enforced, compliance keywords can inject NeMo Guardrails
6. **Cannot-verify fallback** — `verified: false` with suggested `serviceId`s when no documented path is found

---

## Project Structure

```
nvidia-ecosystem-visualizer/
├── app/
│   ├── api/generate-flow/    # NVIDIA NIM path generation (Nemotron + rules)
│   ├── page.tsx              # Root page — layout, state, layer column headers
│   ├── layout.tsx            # Root layout
│   └── globals.css           # Global styles + React Flow theme overrides
├── components/
│   ├── EcosystemGraph.tsx    # React Flow canvas — nodes, edges, fitView logic
│   ├── ServiceNode.tsx       # Custom hex node (glassmorphism + Framer Motion)
│   ├── NodeTooltip.tsx       # Game HUD hover tooltip
│   └── Sidebar.tsx           # Goal input · AI path navigator · explore panel
├── data/
│   ├── nvidia.ts             # 25 services + workflows + source comments → official docs
│   └── skills-catalog.ts     # Static NVIDIA skills baseline + GitHub raw URLs
├── lib/
│   ├── skills-retriever.ts   # Embedding NIM + cosine top-K for prompt grounding
│   └── workflow.ts           # Pure helpers: getWorkflowNodeIds, getWorkflowEdgePairs
└── types/
    └── ecosystem.ts          # TypeScript types + NVIDIA brand colour constants
```

---

## Data Integrity

Every entry in `data/nvidia.ts` includes a source comment linking to the official NVIDIA page it was pulled from (`docs.nvidia.com`, `developer.nvidia.com`, product pages). No descriptions are invented or inferred.

---

## License

MIT © [Doondi Ashlesh](https://github.com/Doondi-Ashlesh)
