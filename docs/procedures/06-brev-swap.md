# 06 — Brev Swap

Invoked when switching from managed NIM to self-hosted NIM on Brev.

## One env change

```
# .env.local (demo config)
NIM_BASE_URL=http://<brev-host>:8000/v1
NIM_CHAT_MODEL=<pinned-container-tag>
NVIDIA_API_KEY=<whatever-auth-brev-needs-or-placeholder>
```

Restart the Next.js server. Nothing else in code changes — every
route goes through `getModelConfig()`.

## Before flipping

1. **Confirm Brev instance is RUNNING** (not paused).
2. **Pin the container tag.** Use an explicit NIM container tag, not
   `:latest`. Record it.
3. **Open the port forward** (SSH tunnel or Brev's native public
   URL). Test with `curl http://localhost:8000/v1/models`.
4. **Pre-warm**: `npm run warmup`. First request cold-loads the
   model (~30–60s); subsequent calls are fast.
5. **Run the golden suite once against Brev.** Compare against the
   managed-NIM reference run. Score should be within ±0.5 of the
   NIM baseline; AST validator pass rate should be identical.

## Known differences NIM-managed vs Brev-hosted

| Aspect | Managed NIM | Brev NIM |
|---|---|---|
| `max_tokens` ceiling | Sometimes capped | Honors the value |
| Rate limits | Per-key RPM | None (your GPU) |
| Cold start | None | 30–60s on first call |
| Tunnel drops | N/A | Possible — keep-alive required |
| Cost model | Per-token | Per-hour |

## If Brev fails during demo

1. Flip `.env.local` back to managed NIM (`integrate.api.nvidia.com`).
2. Restart Next.js.
3. Proceed — users will not know.

This is why `getModelConfig()` is env-driven with no code branches.

## Never commit

- Brev host IPs (they rotate).
- SSH tunnel scripts with embedded credentials.
