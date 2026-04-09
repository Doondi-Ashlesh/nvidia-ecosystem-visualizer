# NVIDIA AI Ecosystem Visualizer

> An interactive graph that maps NVIDIA's entire AI product stack — describe your goal in plain English and Groq AI generates the exact step-by-step path through the ecosystem. (New system updates underway)

![Workflow Path](media/Screenshot%202026-04-02%20213152.png)

---

## What It Does

Developers approaching NVIDIA's AI stack face a fragmented landscape — NIM, NeMo, Triton, TensorRT, Brev — with no map showing how they relate or where to start.

This tool solves that by:

- Visualising all **18 official NVIDIA AI services** as an interactive hexagonal graph
- Drawing **documented connection edges** between services (no invented relationships)
- Letting you describe any goal in plain English — **Groq AI maps the right services in the correct layer order**
- Highlighting your path on the graph with **animated edges + step-by-step guidance**
- **Explore mode** — click any node to see its official description and docs in the sidebar

---

## Screenshots

### AI-Generated Workflow Path
Describe a goal → Groq maps the exact NVIDIA services with roles and actions per step.

![AI Path — Fine-tune an LLM](media/Screenshot%202026-04-02%20213152.png)

---

### HUD Tooltip on Active Node
Hover any node during a workflow to see its official description and a direct link to NVIDIA docs.

![HUD Tooltip](media/Screenshot%202026-04-02%20213334.png)

---

### Explore Mode — Full Graph
Browse all 18 services freely with full visibility. All connections visible at once.

![Explore Mode](media/Screenshot%202026-04-02%20213350.png)

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
| **AI Path Generator** | Type any AI goal — Groq (`llama-3.3-70b`) returns the correct NVIDIA service path with roles and actions per step |
| **Strict layer ordering** | Paths always flow `Access → SDK → Frameworks → Agentic AI → Serving → Enterprise` |
| **Cannot-verify fallback** | If no documented path exists, the AI declines and suggests relevant services instead of fabricating an answer |
| **Interactive hex graph** | Pan, zoom, click — full React Flow canvas with `smoothstep` connection arrows |
| **Game HUD tooltips** | Hover any node for a scanline-style panel with description, tags, and official docs link |
| **Layer zoom** | Hover a layer column header to zoom the canvas into that layer's services |
| **Explore mode** | Browse every service freely — click a node to load its full description and connections in the sidebar |
| **Workflow step navigator** | Follow AI-generated paths step-by-step with auto-pan to each active node and a progress bar |
| **Glassmorphism UI** | Hex nodes with blur + NVIDIA green glow on hover/active states, pitch-black canvas |
| **Responsive** | Hamburger sidebar on mobile, abbreviated layer labels at tablet widths |

---

## Tech Stack

| | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Graph | @xyflow/react v12 |
| Animations | Framer Motion |
| AI | Groq SDK — `llama-3.3-70b-versatile` |
| Icons | Lucide React |

---

## NVIDIA Services Covered

**18 services across 6 layers — all sourced from official NVIDIA documentation.**

| Layer | Services |
|---|---|
| **Access** | build.nvidia.com · NVIDIA Brev · NGC Catalog · DGX Cloud |
| **SDK / Runtime** | CUDA Toolkit · cuDNN · TensorRT · TensorRT-LLM |
| **Frameworks** | NVIDIA NeMo · NeMo Curator · NeMo Guardrails · NeMo Retriever · AI Workbench · RAPIDS |
| **Agentic AI** | NVIDIA Nemotron · NeMo Agent Toolkit · NVIDIA Blueprints |
| **Serving** | NVIDIA Dynamo-Triton · NIM Microservices |
| **Enterprise** | NVIDIA AI Enterprise |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Groq API key](https://console.groq.com/keys) — free tier is sufficient

### Installation

```bash
git clone https://github.com/Doondi-Ashlesh/nvidia-ecosystem-visualizer.git
cd nvidia-ecosystem-visualizer
npm install
```

### Environment

Create `.env.local` in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Doondi-Ashlesh/nvidia-ecosystem-visualizer&env=GROQ_API_KEY&envDescription=Groq%20API%20key%20for%20AI%20path%20generation&envLink=https://console.groq.com/keys)

1. Click the button above or import the repo at [vercel.com/new](https://vercel.com/new)
2. Add the environment variable: `GROQ_API_KEY` = your Groq API key
3. Deploy — Vercel auto-detects Next.js

---

## How the AI Path Generation Works

The Groq prompt enforces strict rules before returning any path:

1. **Layer ordering** — steps must flow `access → sdk → framework → agent → serving → enterprise`
2. **Documented connections only** — only officially-documented service relationships are used
3. **Self-verification** — the model checks layer order, connection validity, and docs grounding before responding
4. **Cannot-verify fallback** — unrecognised goals return a structured response listing suggested services to investigate, never a fabricated path

---

## Project Structure

```
nvidia-ecosystem-visualizer/
├── app/
│   ├── api/generate-flow/    # Groq AI path generation endpoint
│   ├── page.tsx              # Root page — layout, state, layer column headers
│   ├── layout.tsx            # Root layout
│   └── globals.css           # Global styles + React Flow theme overrides
├── components/
│   ├── EcosystemGraph.tsx    # React Flow canvas — nodes, edges, fitView logic
│   ├── ServiceNode.tsx       # Custom hex node (glassmorphism + Framer Motion)
│   ├── NodeTooltip.tsx       # Game HUD hover tooltip
│   └── Sidebar.tsx           # Goal input · AI path navigator · explore panel
├── data/
│   └── nvidia.ts             # 18 services with source comments → official NVIDIA docs
├── types/
│   └── ecosystem.ts          # TypeScript types + NVIDIA brand colour constants
└── lib/
    └── workflow.ts           # Pure helpers: getWorkflowNodeIds, getWorkflowEdgePairs
```

---

## Data Integrity

Every entry in `data/nvidia.ts` includes a source comment linking to the exact official NVIDIA page it was pulled from (`docs.nvidia.com`, `developer.nvidia.com`). No descriptions are invented or inferred.

---

## License

MIT © [Doondi Ashlesh](https://github.com/Doondi-Ashlesh)
