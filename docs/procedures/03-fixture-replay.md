# 03 — Fixture Replay

Invoked when iterating on anything downstream of an LLM call:
validators, parsers, UI, scaffolding, notebook post-processing.

## Why

Every live LLM call is ~30–300 seconds and costs tokens. We iterate
against saved fixtures instead; the round-trip becomes milliseconds
and free.

## Layout

```
fixtures/
  goalspec/
    healthcare-cdss.json        # saved response from /api/analyze-requirements
    fraud-detection.json
  path/
    healthcare-cdss.json        # saved response from /api/generate-flow
  notebook/
    healthcare-cdss.json        # saved notebook cells array
```

Each fixture file records the exact input hash, the model used, and
the raw response content.

## How to save a fixture

After a successful live run, call `saveFixture(stage, name, input, output)`
from inside the route (gated behind `process.env.LLM_SAVE_FIXTURES=1`).
This writes to `fixtures/<stage>/<name>.json`.

## How to replay a fixture

Set env before starting dev server:

```
LLM_REPLAY=fixtures/notebook/healthcare-cdss.json npm run dev
```

The `getModelConfig()` helper detects `LLM_REPLAY`, and each LLM call
returns the fixture content instead of hitting the network. Retry
logic and validators still run — this is exactly what you want when
testing them.

## When NOT to replay

- End-to-end golden-suite runs before merging.
- Verifying a new prompt actually changes model behavior.
- Demo rehearsals.

## Rules

- Fixtures are committed to git. They are small JSON files.
- Never commit fixtures that contain real PII or real patient data.
- Re-save fixtures when the prompt or grounding patterns change —
  stale fixtures hide prompt regressions.
