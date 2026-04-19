# 05 — Demo Checklist

Invoked T-30 minutes before any live demo. Do not skip steps.

## T-30 min

- [ ] Target model endpoint reachable:
      `curl $NIM_BASE_URL/models` returns 200.
- [ ] `.env.local` points to the demo target (NIM or Brev — not
      OpenRouter free tier).
- [ ] `npm run warmup` completes in <60s (pre-loads the model).
- [ ] `/api/health` returns green (model tag + latency visible).
- [ ] App is served at a public HTTPS URL, not `localhost`.
- [ ] Run TC-1 end-to-end; save the resulting notebook as
      `demo-backup-$(date).ipynb`.
- [ ] Keep the backup notebook open in another tab — this is your
      parachute if the live run fails.

## T-5 min

- [ ] One more warm call: open the app, click through to notebook
      stage with a short goal, cancel after the first cell streams.
      Confirms the whole path is hot.
- [ ] Phone on silent.
- [ ] Screen-share source window fixed (not "entire screen").

## During demo

- If the pipeline hangs >60s on a stage that usually takes 30s,
  **do not wait.** Switch to the backup notebook: "Here's one I
  generated earlier, let me walk you through the output while this
  finishes in the background."
- Narrate what's happening while cells stream. Never stare at a
  spinner silently.

## Post-demo

- [ ] Save all generated artifacts and logs (`docs/demo-runs/`).
- [ ] Record which fixtures we used; any failures get a new entry
      in the golden suite.

## Red flags that abort the demo

- Model tag in `/api/health` differs from the tag in the backup
  notebook's provenance header.
- Pipeline failed TC-1 in rehearsal within the last hour.
- Venue network fails a 10 MB upload test.
