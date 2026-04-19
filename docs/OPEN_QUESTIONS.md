# Open Questions — AI Dev Bootstrapper Pipeline

> Questions discovered during implementation that need product/stakeholder feedback.
> These don't block current work but will shape future iterations.

---

## Architecture (updated 2026-04-12)

| # | Question | Context | Status |
|---|---|---|---|
| Q0a | Adversary in Call 2 — should it use ground truth from NVIDIA blueprints? | `lib/ground-truth.ts` exists with 15 blueprint repos. Data showed it hurts the planner (Exp 7) but might help validate scaffolding. | Open |
| Q0b | Progressive delivery — show path immediately, scaffold in background? | Call 1 takes ~60-80s, Call 2 with adversary 2-4min, Call 3 TBD. Total 5+ min. Acceptable for enterprise planning? | Open |
| Q0c | Should we formalize the 10-case test suite as CI regression tests? | Currently `scripts/run_tests.py` runs manually. Prompt changes could regress quality without automated checks. | Open |

## Call 1 — Service Path Generation

| # | Question | Context | Status |
|---|---|---|---|
| Q1 | Should "deploy on AWS SageMaker" return verified:true? | Model interprets it as "NVIDIA stack deployed on SageMaker" which is valid. But SageMaker isn't an NVIDIA service. | Open |
| Q2 | TensorRT vs TensorRT-LLM — acceptable at 8.7/10 or need a post-check? | Model correctly distinguishes for most cases but occasionally gets it wrong for edge cases. | Open |
| Q3 | Should the path include specific model recommendations (e.g., "Nemotron-3 8B")? | Currently paths say "use NIM" not "use NIM with Nemotron-3 8B." Scaffolding needs model specifics. | Open — letting Call 2 handle this |

## Stage 4 — Scaffolding Generation

| # | Question | Context | Status |
|---|---|---|---|
| Q5 | How specific should model/config recommendations be? | "Use an LLM" vs "Use Nemotron-3 8B with INT8 quantization on A100." Former is safe, latter is actionable but might be wrong. | Deferred — building for "best possible" first, tailoring later |
| Q6 | Should scaffolding include cost estimates? | Users care about GPU costs. GoalSpec has hardware constraints but not budget. | Deferred — not in scope for initial build |
| Q7 | How should the scaffolding handle GoalSpec gaps? | If Stage 1 flagged "no training dataset specified" as a gap, should Stage 4 make an assumption or leave a TODO? | Open — leaning toward explicit TODOs |
| Q8 | Should features be auto-sharded (one file per feature) or consolidated? | Blueprint pattern uses sharded features/. How many features = too many files? | Open — will test with real output |

## Stage 5 — Notebook Generation

| # | Question | Context | Status |
|---|---|---|---|
| Q9 | Should the notebook include actual runnable code or scaffold code? | Current export-notebook generates scaffold code (prints, env vars). AMT asked for "production-ready." | Open — building scaffold first, can iterate |
| Q10 | Should the notebook self-evaluate by running the code or just checking structure? | Running code requires live NVIDIA API access. Structural check can be done offline. | Open — structural check first |
| Q11 | How do we handle NVIDIA services that require paid access? | Some services (DGX Cloud, AI Enterprise) can't be called from a notebook without enterprise contracts | Open — scaffold with env var placeholders |

## Stage 6 — Export

| # | Question | Context | Status |
|---|---|---|---|
| Q12 | Should the zip include environment setup scripts (docker-compose, requirements.txt)? | Blueprint pattern includes deploy/ folder. Adds significant value but also complexity. | Deferred |
| Q13 | Should there be a "share this plan" URL (like a gist) or only file download? | Karpathy/OpenClaw concept — share intent. URL sharing is higher impact but needs backend. | Deferred |

## User Tailoring (Future)

| # | Question | Context | Status |
|---|---|---|---|
| Q14 | How should user budget constraints affect service selection? | "I only have $500/month" changes whether you recommend DGX Cloud vs local GPUs | Deferred — building for "best possible" first |
| Q15 | Should users be able to specify their existing infrastructure? | "I already have a Kubernetes cluster" changes the scaffolding significantly | Deferred |
| Q16 | Should there be a "beginner vs advanced" mode? | Beginners need more explanation, fewer services. Advanced users want the full pipeline. | Deferred |
| Q17 | How do we handle conflicting user preferences vs best practices? | User says "no guardrails" for a healthcare app. Do we override or warn? | Open |

## Model & Inference

| # | Question | Context | Status |
|---|---|---|---|
| Q18 | Should we test the pipeline with a different model (e.g., 49B for speed)? | 120B is best quality but slow. 49B was faster but produced 4-service paths with old prompt. Untested with new data-flow prompt. | Deferred — will test as comparison study |
| Q19 | Self-hosted NIM vs shared API — when do we switch? | Shared API has queue latency (~50s/call). Self-hosted would be 5-10x faster. | Deferred — depends on deployment context |

---

*Last updated: 2026-04-12 (architecture simplified to 3-call pipeline)*
