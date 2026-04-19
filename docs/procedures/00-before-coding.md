# 00 — Before Coding

Open this file before starting any new task. Two minutes here saves
an hour of rework.

## Pre-flight checklist

1. **Know the goal in one sentence.** If you can't state it, stop and
   clarify before writing code.
2. **Identify the blast radius.** What files will this touch? What
   routes? What does the user see differently afterward?
3. **Check for dead code in the path.** If the feature overlaps with
   `lib/ground-truth.ts` or `lib/skills-retriever.ts`, those are
   slated for deletion — do not extend them.
4. **Decide: live LLM or replay?** If you're iterating on prompts,
   validators, or parsing, use replay (see `03-fixture-replay.md`).
   Live calls are for end-to-end verification only.
5. **Budget credits before starting.** Managed NIM is metered. A full
   pipeline run is ~3 LLM calls × ~10–40k tokens. Don't burn credits
   on iteration.

## Decision tree

- **Adding a new LLM call?** → `01-llm-route.md`
- **Checking LLM output for correctness?** → `02-validator.md`
- **Touching `notebook-patterns.ts` or adding a service?** →
  `04-grounding-manifest.md`
- **Running the full pipeline live?** → pre-warm, check env, save
  fixtures for later replay.

## What every change must include

- [ ] Clear WHY comment at the top of new files.
- [ ] No hardcoded URLs, model names, or keys.
- [ ] Passes `npx next build` without warnings introduced by this
      change.
- [ ] If behavior-visible to the user: a manual sanity check or a
      golden-suite entry.
