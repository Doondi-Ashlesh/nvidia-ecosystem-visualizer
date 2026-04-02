# NVIDIA AI Ecosystem Visualizer

An interactive graph that maps NVIDIA's entire AI product stack — showing how every service connects, and generating a custom step-by-step path for your specific goal using Groq AI.

> **All data is sourced exclusively from official NVIDIA documentation.**
> No invented connections, no inferred capabilities.

---

## Overview

New developers approaching NVIDIA's AI stack face a fragmented landscape — NIM, NeMo, Triton, TensorRT, Brev — with no visual map showing how they relate or where to start.

This tool solves that by:

- Visualising all 18 official NVIDIA AI services as an interactive hexagonal graph
- Drawing the official connection edges between them (documented relationships only)
- Letting you describe your goal in plain English — Groq AI generates the correct path through the ecosystem
- Highlighting your path on the graph with animated edges and step-by-step guidance

---

## Features

| Feature | Description |
|---|---|
| **AI Path Generator** | Describe any AI goal — Groq (`llama-3.3-70b`) maps the right NVIDIA services in the correct layer order |
| **Strict layer ordering** | Paths always follow `access → sdk → framework → agent → serving → enterprise` |
| **Verification check** | If no documented path exists for a goal, the AI says so and suggests services to investigate instead |
| **Interactive graph** | Pan, zoom, hover, click — full React Flow canvas with `smoothstep` connection edges |
| **Game HUD tooltips** | Hover any node for an RPG-style info panel with description, tags, and a direct link to official docs |
| **Layer zoom** | Hover a layer column header to zoom the canvas into that layer and see all its services |
| **Explore mode** | Browse every service freely — hover for full description, click to open official docs |
| **Workflow step navigator** | Follow AI-generated paths step by step with auto-pan to each active node |

---

## Tech Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4**
- **@xyflow/react v12** — interactive node graph with connection edges
- **Framer Motion** — smooth animations, spring transitions, staggered effects
- **Groq SDK** — `llama-3.3-70b-versatile` for AI path generation
- **Lucide React** — icons

---

## NVIDIA Services Covered (18 total)

| Layer | Services |
|---|---|
| **Access** | build.nvidia.com, NVIDIA Brev, NGC Catalog, DGX Cloud |
| **SDK / Runtime** | CUDA Toolkit, cuDNN, TensorRT, TensorRT-LLM |
| **Frameworks** | NVIDIA NeMo, NeMo Curator, NeMo Guardrails, NeMo Retriever, AI Workbench, RAPIDS |
| **Agentic AI** | NVIDIA Nemotron, NeMo Agent Toolkit, NVIDIA Blueprints |
| **Serving** | NVIDIA Dynamo-Triton, NIM Microservices |
| **Enterprise** | NVIDIA AI Enterprise |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Groq API key](https://console.groq.com/keys) (free tier available)

### Installation

```bash
git clone https://github.com/Doondi-Ashlesh/nvidia-ecosystem-visualizer.git
cd nvidia-ecosystem-visualizer
npm install
```

### Environment setup

Create a `.env.local` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploying to Vercel

1. Push to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Add the environment variable in **Settings → Environment Variables**:
   - `GROQ_API_KEY` = your Groq API key
4. Deploy — Vercel auto-detects Next.js

---

## Project Structure

```
nvidia-ecosystem-visualizer/
├── app/
│   ├── api/generate-flow/    # Groq AI path generation endpoint
│   ├── page.tsx              # Main page — layout, state, layer dropdowns
│   ├── layout.tsx            # Root layout with Barlow font
│   └── globals.css           # Global styles + React Flow theme overrides
├── components/
│   ├── EcosystemGraph.tsx    # React Flow canvas — nodes, edges, tooltips
│   ├── ServiceNode.tsx       # Custom hex node with glassmorphism + animations
│   ├── NodeTooltip.tsx       # Game HUD hover tooltip with docs link
│   └── Sidebar.tsx           # Goal input, AI path display, explore panel
├── data/
│   └── nvidia.ts             # All 18 services + 6 workflows (official docs sourced)
├── types/
│   └── ecosystem.ts          # TypeScript types + NVIDIA brand constants
└── lib/
    └── workflow.ts           # Pure helpers for workflow path computation
```

---

## Data Integrity

Every service entry in `data/nvidia.ts` includes a source comment linking to the exact official NVIDIA page it was sourced from. The Groq prompt enforces:

1. **Correct layer ordering** — `access → sdk → framework → agent → serving → enterprise`
2. **Cannot-verify fallback** — if no documented path exists, the AI declines and lists relevant services instead of fabricating an answer
3. **Official docs grounding** — each step must be supported by that service's documented capabilities
4. **Self-verification** — the model performs a 4-point check before returning any path

---

## License

MIT
