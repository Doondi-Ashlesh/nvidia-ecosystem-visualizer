# 02 — Validator

Invoked when building or editing validation layers: schema check,
AST grounding check, narrative-structure check.

## Validator layering (fail-closed)

Every LLM output passes through three layers. Failure at any layer
triggers a re-prompt with the specific violation; after 3 failures,
the route returns an error.

1. **Schema layer (zod)** — structural correctness. Example: array of
   `{ cell_type: "markdown" | "code", source: string }`.
2. **Grounding layer (AST)** — only for code cells. Parse Python AST,
   extract every `import` and attribute chain, assert each symbol is
   in the allowed-API manifest for the services in the path.
3. **Narrative layer (regex/heading)** — only for notebook outputs.
   Assert the required cells exist: overview, setup, at least one
   baseline OR before/after section, eval, summary.

## Building a new validator

1. Name the file: `lib/validators/<what>.ts`.
2. Export a single function: `validate<What>(input): ValidationResult`.
3. `ValidationResult = { ok: true } | { ok: false; errors: string[] }`.
   Errors must be specific enough to paste back into a re-prompt.
4. **Build it against a fixture first.** Import a saved LLM response
   from `fixtures/`, write the validator, assert it catches known bad
   cases. Only then wire it into the live route.
5. Add the validator to the route's retry loop: on failure, append
   errors to the user prompt prefixed with "Your previous response
   had these issues — fix them:".

## Error messages — the re-prompt rule

A validator error is only useful if the model can act on it. Bad
error: "invalid output". Good error: "cell 3 uses
`from_pretrained('nvidia/nv-embedqa-e5-v5')` but this model is not in
the allowed-API manifest for service 'nim'. Use one of: [list]."

## Checklist

- [ ] Validator has unit test against a saved fixture.
- [ ] Error messages name the specific violation and suggest a fix.
- [ ] Hooked into the route's retry loop.
- [ ] Does not make live LLM calls from within itself.
