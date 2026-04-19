# 04 — Grounding Manifest

Invoked whenever you touch `lib/notebook-patterns.ts`, add a new
NVIDIA service to the catalog, or modify the AST validator.

## Two files, one source of truth

- `lib/notebook-patterns.ts` — human-readable code snippets embedded
  in the system prompt. Shows the model *how* to call an API.
- `lib/allowed-apis.ts` — machine-readable manifest. Tells the AST
  validator *which* symbols are valid for a service.

**Rule:** every importable symbol shown in `notebook-patterns.ts`
must also be listed in `allowed-apis.ts`. CI-level check can be
added later; for now, a manual diff before merging.

## Manifest shape

```ts
export const ALLOWED_APIS: Record<ServiceId, AllowedAPI> = {
  'nemo-curator': {
    packages: ['nemo_curator'],
    symbols: [
      'nemo_curator.pipeline.Pipeline',
      'nemo_curator.stages.base.ProcessingStage',
    ],
    pipInstall: 'nemo-curator',
  },
  // ...
};
```

## Adding a service

1. Confirm the service exists in the NVIDIA catalog
   (`lib/nvidia-catalog.ts` or equivalent).
2. Read the service's real GitHub repo `__init__.py` or public
   docs. Do NOT rely on model knowledge.
3. Add a pattern entry in `notebook-patterns.ts` with a minimal but
   complete code snippet.
4. Add the manifest entry in `allowed-apis.ts` listing every symbol
   used in the snippet.
5. If the service introduces a new training domain, update
   `hasTraining` in `getRelevantPatterns()`.
6. Save a fixture that exercises this service and run the AST
   validator against it; confirm no false positives.

## Updating an existing service's API

When NVIDIA ships a breaking change:

1. Update the pattern snippet.
2. Update the manifest — add new symbols AND remove old ones.
3. Re-run the golden suite; fixtures using the old API will fail
   AST validation. That's correct — re-save them with the new
   pattern.
4. Bump the `PATTERN_MANIFEST_VERSION` constant; it ends up in the
   notebook's provenance header.

## Anti-patterns

- Do NOT add a symbol "just in case" — every symbol in the manifest
  is a surface the model can hallucinate confidently.
- Do NOT accept model-suggested APIs without verifying against the
  repo source.
