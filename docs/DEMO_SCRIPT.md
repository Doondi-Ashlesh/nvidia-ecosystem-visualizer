# NVIDIA AI Ecosystem Visualizer — Demo Script

Use this document to walk a technical audience through a live or recorded demo. Timing is indicative; adjust for your slot (15–45 minutes).

---

## 1. Introduction (2–3 min)

**Opening line (suggested):**

> “The NVIDIA AI stack is broad — NGC, NeMo, Triton, TensorRT, NIM, AI Enterprise — and teams often struggle to see how these pieces fit together for a *specific* outcome. This app is an **interactive map** of **25 services across 6 layers**, plus an **AI path generator** that turns a plain-English goal into a **layer-ordered sequence** grounded in official NVIDIA positioning.”

**One-liner:** *Map the stack; generate a defensible path; explore nodes and docs.*

**Who it’s for:** architects, field engineers, developers, and technical decision-makers evaluating how to assemble NVIDIA products for a workload (RAG, fine-tuning, enterprise deployment, etc.).

**What it is not:** a replacement for architecture review, compliance sign-off, or reading the full product documentation — it’s a **structured starting point** and **learning surface**.

---

## 2. What the product is for (2 min)

| Goal | How the app supports it |
|------|-------------------------|
| **Orientation** | See official services as a **layered graph** (Access → … → Enterprise) with documented edges. |
| **Pathfinding** | Type a **goal**; **Nemotron** (via **NVIDIA NIM**) proposes a path with **steps**, **roles**, and **actions**. |
| **Grounding** | Optional **skill retrieval** injects short blurbs from an NVIDIA-aligned skills catalog into the model prompt. |
| **Governance** | **Prompt rules** + **server-side post-processing** enforce exclusions, ordering, and mandatory inclusions. |
| **Exploration** | **Explore** mode: click any node for official descriptions and links. |

**Modes (UI):** `initial` (goal entry), `workflow` (step-through path), `explore` (free navigation).

---

## 3. Architecture — how “NVIDIA native” it is (4–6 min)

### 3.1 Frontend

- **Next.js** (App Router), **React**, **TypeScript**, **Tailwind CSS**.
- **Graph:** `@xyflow/react` for the interactive ecosystem canvas.
- **Motion / icons:** Framer Motion, Lucide.
- The main page is **client-heavy** (`'use client'`) for graph interactivity and animations.

### 3.2 Backend (path generation)

- **Single API route:** `POST /api/generate-flow` (Next.js Route Handler).
- **HTTP client:** `openai` SDK in **OpenAI-compatible** mode against **NVIDIA NIM**:
  - **Default:** `https://integrate.api.nvidia.com/v1`
  - **Optional self-host:** `NIM_BASE_URL` (e.g. Brev / on-prem NIM) + `NIM_CHAT_MODEL` if the served model id differs.
- **Chat model (default):** `nvidia/nemotron-3-super-120b-a12b`.
- **Auth:** `NVIDIA_API_KEY` (required for hosted APIs).

### 3.3 Retrieval / “NeMo Retriever pattern” (grounding)

- **Embeddings:** `nvidia/nv-embedqa-e5-v5` via the **same integrate API** (implemented in `lib/skills-retriever.ts`).
- **Mechanism:** embed the user **goal**, compare to embedded **skill** strings with **cosine similarity**, return **top-K** (e.g. 5) skills; inject into the **system prompt** as “RETRIEVED AGENT SKILLS”.
- **Note:** This is **not** a full enterprise RAG over arbitrary customer documents — it **grounds** the planner on **curated NVIDIA skill metadata**.

### 3.4 Why call it “NVIDIA native”

- **Inference:** Nemotron through **NIM** (hosted or self-hosted OpenAI-compatible endpoint).
- **Embeddings:** NVIDIA **embedding NIM** for retrieval grounding.
- **Data:** Service definitions and connections are authored to reflect **official** product boundaries (see `data/nvidia.ts` source comments + URLs).
- **No third-party LLM** in the default configuration; optional `NIM_BASE_URL` still targets **your** NIM deployment.

---

## 4. What gets “fetched” at the beginning (startup / first request)

### 4.1 Browser

- Loads the **Next.js** app shell, **React** bundle, **React Flow**, and **static assets** (e.g. `public/nvidia.png`).
- **No** user data is fetched until the user interacts.

### 4.2 Server — skills refresh (optional)

On **server startup** (when the route module loads), `lib/skills-retriever.ts` may:

1. **Fetch** SKILL.md sources from **GitHub** (URLs in `data/skills-catalog.ts`), parse YAML frontmatter, merge into an in-memory **live** catalog.
2. **Invalidate** the embedding cache so the next retrieval run re-embeds.

**Requirements:** `NVIDIA_API_KEY` for embeddings; optional `GITHUB_TOKEN` for friendlier GitHub rate limits.

**Fallback:** If GitHub fails, the compiled-in **`STATIC_SKILLS`** in `data/skills-catalog.ts` remains the source of truth.

### 4.3 First path-generation request

1. **`retrieveRelevantSkills(goal)`** (if embeddings succeed): builds/refreshes **embedding cache** in memory, returns top-K skills.
2. **`runGeneration`:** builds the **system prompt** (rules + full service list + skills block) and calls **chat completions** on NIM.

---

## 5. Path generation workflow (step-through for demo)

**Narrate while clicking:**

1. User enters a **goal** in the sidebar → `POST /api/generate-flow` with `{ goal }`.
2. **Skills retrieval** (best effort): embed goal + rank skills → **non-fatal** if it fails (generation continues without grounding).
3. **Nemotron** returns **JSON** (with optional reasoning trace if `NIM_REASONING` is enabled).
4. **Parse & repair:** strip fences, extract first JSON object if the model adds prose.
5. **Branch:**
   - **`verified: false`** → HTTP **422** + message + suggested service ids (documented “no path” case).
   - **`verified: true`** → **server pipeline:**
     - Drop unknown `serviceId`s; **retry** once if no valid steps.
     - **Sort** by **canonical layer order**.
     - **Intra-layer** swaps from `INTRA_LAYER_ORDER`.
     - **Mandatory pairs** (e.g. retriever → NIM): append missing tail services.
     - **Service exclusions** by goal keywords (strip invalid services).
     - **Inject** `nemo-guardrails` / `nemo-evaluator` / `tensorrt-llm` when **goal keywords** match (compliance, evaluation, engine compilation).
     - **Re-sort** after injections.
     - Normalize each step’s **`role`** to the catalog **`shortDescription`** for consistent UI copy.
6. Client receives **steps** → builds a **synthetic workflow** → sidebar + graph highlight **step-by-step**.

---

## 6. Guardrails (explain clearly — 3 min)

**Three layers:**

1. **Prompt rules (Nemotron)**  
   Non-negotiable instructions in the system prompt: layer order, RAG vs training, exclusions, compliance language, short-goal JSON-only output, regulated-domain wording (e.g. NGC vs customer PHI), etc.

2. **Server-side enforcement**  
   Deterministic checks: valid ids, sorting, exclusions, mandatory pairs, keyword-based **injection** of guardrails / evaluator / TensorRT-LLM when the **goal text** matches.

3. **Product reality**  
   **NeMo Guardrails** appears as a **service node** when the scenario requires policy/safety rails — aligned with NVIDIA’s positioning for compliance-heavy goals.

**Say explicitly:** this is **not** a substitute for organizational compliance review or HIPAA certification; it’s **documentation-aligned path planning** plus **safety-oriented product inclusion** where the stated goal requires it.

---

## 7. Static content — where it lives and how it’s stored

| Content | Location | Storage / lifecycle |
|--------|----------|------------------------|
| **Services (25), layers, edges, curated workflows** | `data/nvidia.ts` | **Source code** — shipped with the app; versioned in git. |
| **Types, layer labels, colors** | `types/ecosystem.ts` | TypeScript — compile-time + bundled. |
| **Skills baseline** | `data/skills-catalog.ts` | **Static** snapshot; comment header references **nvidia/skills** and update process. |
| **Live skills (optional)** | GitHub raw SKILL.md | Fetched **at server startup** into **memory**; merged over static baseline. |
| **Embeddings cache** | `lib/skills-retriever.ts` | **In-memory** only — persists across requests on a **long-lived Node** process (`next start`). **Not** durable across cold starts in **serverless** without redesign. |
| **Public assets** | `public/` | Static files via Next.js. |

**Talking point:** *“We trade off enterprise durability for demo simplicity — everything is either in-repo or in-memory on the Node server.”*

---

## 8. Architectural decisions and tradeoffs

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| **Next.js Route Handler** for AI | Same deployable as UI; simple ops. | Long-running **NIM** calls block the worker unless you add queues later. |
| **OpenAI-compatible SDK → NIM** | Standard tooling; easy swap to self-hosted `NIM_BASE_URL`. | Vendor-specific features require adapter work. |
| **No database** | Faster to ship; no migrations. | No saved sessions, analytics, or multi-tenant history in-app. |
| **Client-heavy graph** | Rich interactivity with React Flow. | Larger JS bundle; **LCP** sensitive — measure on **production** build. |
| **Skills in memory** | Fast retrieval after first embed. | Serverless/edge **cold starts** pay full embed cost; **multi-instance** duplicates cache. |
| **Server post-processing** | Guarantees ordering/rules even when the model drifts. | Extra maintenance when `data/nvidia.ts` changes. |
| **Catalog-normalized subtitles** | Consistent product naming in the sidebar. | Less “creative” per-step labels from the model in the subtitle line. |

---

## 9. Future directions (roadmap talking points)

- **Observability:** structured logs, metrics, optional **RUM** (Web Vitals) in production.
- **Persistence:** save/share workflows (URLs, export JSON).
- **Performance:** `next/dynamic` for the graph, streaming responses, lower `max_tokens`, optional **edge caching** for static graph data.
- **Deployment:** health checks; **rate limiting** on `/api/generate-flow` for public demos.
- **Self-hosted parity:** optional **embedding** base URL env (today embeddings stay on **integrate** by design).
- **Testing:** golden prompts for CI on path JSON schema and rule pipeline.

---

## 10. Optimizations (what to say if asked)

**Already sensible in the codebase**

- **Production vs dev:** `npm run build` + `npm start` for realistic performance; `next dev` is slower.
- **`next.config`:** `outputFileTracingRoot` / `turbopack.root` pinned to the repo when a **parent folder** has an extra `package-lock.json` (avoids wrong workspace root on Windows/Desktop setups).
- **Reasoning off by default** (`NIM_REASONING`) for lower latency unless a reasoning trace is needed.
- **JSON repair** (fenced blocks + first balanced `{…}`) to reduce failures on short or messy model output.

**Good next steps (not all implemented)**

- Code-split **`EcosystemGraph`** to improve first paint.
- Add **response caching** for identical goals (careful with PII in demos).
- **Streaming** partial responses if NIM + client support it.

---

## 11. Suggested demo flow (12–15 min live)

1. **Landing:** show **6 layer headers** + dimmed graph — “25 services, official structure.”
2. **Explore:** click **Explore freely** → hover **2–3 nodes** — sidebar shows **official description + docs link**.
3. **Goal:** type a **concrete goal** (e.g. enterprise RAG on regulated data) → **Generate**.
4. **Walk the path:** use **Prev/Next** — graph pans to each step; mention **layer discipline**.
5. **Deep dive (optional):** expand **Model Reasoning** if enabled — show trace vs latency tradeoff.
6. **Honest close:** “Grounded on NVIDIA’s catalog and docs-shaped rules — validate in your environment and compliance process.”

---

## 12. Q&A cheat sheet

- **“Is this official NVIDIA software?”** — It’s a **demo app** using **public NVIDIA APIs** and **documentation-aligned** data; not a separately shipped NVIDIA product.
- **“Does it call anything non-NVIDIA?”** — Default chat + embeddings are **NVIDIA NIM**; optional GitHub fetch for **skills** metadata only.
- **“Can we run chat on Brev?”** — Yes: set **`NIM_BASE_URL`** / **`NIM_CHAT_MODEL`**; embeddings still use **integrate** unless you change `skills-retriever.ts`.
- **“Where do embeddings run?”** — **`integrate.api.nvidia.com`** with **`nvidia/nv-embedqa-e5-v5`**.

---

*Last aligned with repo layout: Next.js 16, App Router, `components/Sidebar.tsx`, `components/EcosystemGraph.tsx`, `app/api/generate-flow/route.ts`, `lib/skills-retriever.ts`, `data/nvidia.ts`, `data/skills-catalog.ts`.*
