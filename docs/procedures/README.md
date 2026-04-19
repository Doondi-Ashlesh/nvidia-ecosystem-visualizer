# Engineering Procedures

Short playbooks invoked at specific moments during development. Each
procedure is self-contained and exists so we don't re-derive the same
rules every time we touch the pipeline.

## When to open which file

| Moment | Open |
|---|---|
| Before ANY code change | [00-before-coding.md](./00-before-coding.md) |
| Adding or editing an LLM route | [01-llm-route.md](./01-llm-route.md) |
| Building a validator (schema, AST, narrative) | [02-validator.md](./02-validator.md) |
| Running the pipeline during development | [03-fixture-replay.md](./03-fixture-replay.md) |
| Adding a new NVIDIA service grounding | [04-grounding-manifest.md](./04-grounding-manifest.md) |
| Before a demo | [05-demo-checklist.md](./05-demo-checklist.md) |
| Switching from managed NIM to Brev | [06-brev-swap.md](./06-brev-swap.md) |

## Invariants across all procedures

1. No secrets in code — everything reads from `.env.local`.
2. No hardcoded model names or base URLs — use `getModelConfig()`.
3. No live LLM calls during iteration — use fixture replay unless
   validating end-to-end.
4. Every LLM output goes through a zod schema before use.
5. Every generated notebook carries a provenance header.
6. Every change must pass: `npx next build` clean.
