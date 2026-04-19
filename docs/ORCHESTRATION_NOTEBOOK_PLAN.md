# Plan: Orchestration notebook export

## Goal

Turn a **generated NVIDIA path** (from the visualizer) into:

1. A **written implementation plan** (inside the notebook as markdown).
2. A **Jupyter notebook** (`.ipynb`) with **setup**, **per-step guidance**, and **Python stubs** that teams can run or extend to wire real orchestration (NIM, containers, Retriever, etc.).

## Scope (v1)

- **In scope:** Download `.ipynb` from **workflow mode** after a path is generated.
- **Notebook contains:** prerequisites, env vars, one markdown + one code section per step, **service-specific** hints where we have stable patterns (e.g. OpenAI-compatible **NIM** client).
- **Out of scope for v1:** Auto-provisioning cloud resources, Terraform, Kubernetes manifests, full NeMo Retriever YAML generation, or guaranteed runnable end-to-end pipelines without human edits.

## Why not “fully automatic” orchestration?

Real orchestration depends on **your** VPC, data plane, identity, vector DB, and compliance. The notebook is a **scaffold**: correct **ordering**, **official links**, and **starting code** — engineers still **fill in** endpoints, credentials, and data paths.

## Architecture

| Piece | Role |
|-------|------|
| `lib/workflow-notebook.ts` | Builds **nbformat 4** JSON from `Workflow` + `NVIDIA_SERVICES` metadata. |
| `POST /api/export-notebook` | Validates `serviceId`s, returns **downloadable** `.ipynb`. |
| `Sidebar` | **Export notebook** button in workflow mode. |

## Security

- Server **rejects** unknown `serviceId` values (must exist in `data/nvidia.ts`).
- No arbitrary code injection from the client — templates are **server-defined**; user text appears only in **markdown** and **comments** inside safe string escaping.

## Future directions

- Second artifact: **Markdown-only** runbook (same content, no cells).
- **LangGraph** / **Prefect** / **Airflow** exporters behind the same “Export” menu.
- Per-vertical **templates** (healthcare RAG vs fine-tuning) with richer stubs.
- **Streaming** generation for very long paths.

## Tradeoffs

- **Python-only** notebook matches most NVIDIA samples; other languages could be added later.
- **One code style** (OpenAI SDK) for NIM — matches this app’s server implementation.
