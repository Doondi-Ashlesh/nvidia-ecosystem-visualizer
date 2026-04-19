# Brev NIM Deployment Guide

> Deploy Nemotron 3 Super 120B on a dedicated GPU via Brev to reduce inference latency from ~50-80s to ~10-20s per call.

---

## Prerequisites

- Brev account with GPU credits ([brev.dev](https://brev.dev))
- NVIDIA NGC account ([ngc.nvidia.com](https://ngc.nvidia.com)) for pulling NIM containers
- NVIDIA API key (same one used for the shared API)

---

## Step 1: Install Brev CLI

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/brevdev/brev-cli/main/bin/install-latest.sh | bash

# Verify
brev version
```

## Step 2: Login

```bash
brev login
```

## Step 3: Create a GPU Instance

```bash
# For Nemotron 120B you need at least 2x A100 80GB or 4x A100 40GB
# The model is ~240GB in FP16, ~120GB in FP8
brev create nim-nemotron \
  --gpu a100:80gb:2 \
  --disk 200 \
  --image ubuntu-22.04

# Wait for instance to be ready
brev ls
```

## Step 4: SSH into the Instance

```bash
brev shell nim-nemotron
```

## Step 5: Pull and Run the NIM Container

```bash
# Login to NGC
docker login nvcr.io
# Username: $oauthtoken
# Password: <your NGC API key>

# Pull the Nemotron NIM container
docker pull nvcr.io/nim/nvidia/nemotron-3-super-120b-a12b:latest

# Run with GPU access
docker run -d \
  --name nemotron-nim \
  --gpus all \
  -p 8000:8000 \
  -e NVIDIA_API_KEY=$NVIDIA_API_KEY \
  nvcr.io/nim/nvidia/nemotron-3-super-120b-a12b:latest

# Wait for model to load (check logs)
docker logs -f nemotron-nim
# Look for: "Uvicorn running on http://0.0.0.0:8000"
```

## Step 6: Get the Endpoint URL

```bash
# From your local machine, get the Brev instance IP
brev ls --json | grep -i ip

# The NIM endpoint will be:
# http://<brev-instance-ip>:8000/v1
```

## Step 7: Update the App

In your `.env.local` file, add:

```env
NIM_BASE_URL=http://<brev-instance-ip>:8000/v1
```

That's it. The app already reads `NIM_BASE_URL` and falls back to `integrate.api.nvidia.com` when not set. All API routes use this variable.

## Step 8: Verify

```bash
# Test the endpoint directly
curl http://<brev-instance-ip>:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"nvidia/nemotron-3-super-120b-a12b","messages":[{"role":"user","content":"hello"}],"max_tokens":50}'

# Then start the app and test — should be 5-10x faster
npm run dev
```

---

## Expected Performance

| Metric | Shared API | Self-hosted (Brev) |
|---|---|---|
| Per-call latency | 50-80s | 10-20s |
| GoalSpec (Stage 1) | 60-220s | 15-50s |
| Path generation (Stage 2) | 80-120s | 15-25s |
| Notebook generation | 150-300s | 30-60s |
| **Total pipeline** | **5-8 min** | **1-2 min** |

---

## Cost Estimate

| GPU Config | Approx Cost | Notes |
|---|---|---|
| 2x A100 80GB | ~$4-6/hr | Recommended — fits 120B in FP8 |
| 4x A100 40GB | ~$6-8/hr | Alternative — tensor parallel across 4 GPUs |
| 1x H100 80GB | ~$4-5/hr | May work with aggressive quantization |

---

## Troubleshooting

**Container exits immediately:**
- Check `docker logs nemotron-nim` — likely GPU memory issue
- Try adding `--shm-size=16g` to the docker run command

**Slow first request:**
- First request after model load takes longer (cold start)
- Subsequent requests should be fast

**Connection refused:**
- Ensure port 8000 is open on the Brev instance
- Check firewall: `sudo ufw allow 8000`

**Model too large for GPU:**
- The 120B model needs ~120GB GPU memory in FP8
- 2x A100 80GB = 160GB total (sufficient)
- 1x A100 40GB = not enough

---

## Files That Reference NIM_BASE_URL

These routes automatically use the self-hosted endpoint when `NIM_BASE_URL` is set:

- `app/api/generate-flow/route.ts` — reads `process.env.NIM_BASE_URL`
- `app/api/analyze-requirements/route.ts` — hardcoded to `integrate.api.nvidia.com` (needs update)
- `app/api/generate-notebook/route.ts` — hardcoded to `integrate.api.nvidia.com` (needs update)

**TODO:** Update `analyze-requirements` and `generate-notebook` routes to also read `NIM_BASE_URL`.
