/**
 * Real NVIDIA code patterns extracted from official GitHub repos.
 *
 * These patterns ground the notebook generator so it uses correct APIs
 * instead of hallucinating function names. Validated: 5.5/10 without
 * grounding → 8.5/10 with grounding (Experiment 8).
 *
 * Sources:
 *   - NeMo Curator: github.com/NVIDIA/NeMo-Curator/tutorials/quickstart.py
 *   - NeMo Guardrails: github.com/NVIDIA/NeMo-Guardrails README
 *   - Model Optimizer: github.com/NVIDIA/TensorRT-Model-Optimizer README
 *   - Triton Client: github.com/triton-inference-server/client/examples
 *   - NIM: NVIDIA NIM API docs (OpenAI-compatible)
 *   - RAPIDS: rapids.ai docs
 *   - NeMo Evaluator: github.com/NVIDIA-NeMo/Evaluator README
 */

const PATTERNS: Record<string, string> = {

  'nemo-curator': `NeMo Curator (correct API):
  from nemo_curator.pipeline import Pipeline
  from nemo_curator.stages.base import ProcessingStage
  # Uses Pipeline and ProcessingStage pattern
  # pipeline = Pipeline([YourStage()])
  # result = pipeline.run(input_path)`,

  'nemo-guardrails': `NeMo Guardrails (correct API):
  from nemoguardrails import LLMRails, RailsConfig
  config = RailsConfig.from_path("path/to/config")
  rails = LLMRails(config)
  response = rails.generate(messages=[{"role": "user", "content": "..."}])
  # Requires config.yml with instructions + sample_conversation
  # Requires .co colang files defining conversation rails`,

  'model-optimizer': `Model Optimizer (correct package):
  pip install nvidia-modelopt
  import modelopt.torch.quantization as mtq
  # Quantize: quantized_model = mtq.quantize(model, quant_config)
  # Supports INT8, FP8, INT4 quantization`,

  'triton': `Triton Inference Server (correct client):
  import tritonclient.http as httpclient
  client = httpclient.InferenceServerClient(url="localhost:8000")
  inputs = httpclient.InferInput("input_name", shape, "FP32")
  inputs.set_data_from_numpy(numpy_array)
  outputs = [httpclient.InferRequestedOutput("output_name")]
  results = client.infer(model_name="model", inputs=[inputs], outputs=outputs)`,

  'nim': `NVIDIA NIM (correct usage — OpenAI compatible):
  from openai import OpenAI
  client = OpenAI(
      base_url="https://integrate.api.nvidia.com/v1",
      api_key=os.environ["NVIDIA_API_KEY"]
  )
  response = client.chat.completions.create(
      model="nvidia/nemotron-3-super-120b-a12b",
      messages=[{"role": "user", "content": "..."}]
  )`,

  'rapids': `RAPIDS (correct usage — GPU-accelerated DataFrames):
  import cudf
  import dask_cudf
  gdf = cudf.read_parquet("data.parquet")
  # GPU-accelerated pandas-like API
  # gdf["new_col"] = gdf["col_a"] + gdf["col_b"]
  # gdf.to_parquet("output.parquet")`,

  'nemo-evaluator': `NeMo Evaluator (correct usage — CLI tool):
  pip install nemo-evaluator-launcher
  # CLI: nemo-evaluator-launcher run --config eval_config.yaml
  # Config YAML specifies: model endpoint, eval dataset, metrics
  # Use subprocess to invoke from notebook:
  import subprocess
  subprocess.run(["nemo-evaluator-launcher", "run", "--config", "eval.yaml"])`,

  'nemo': `NeMo Framework (training):
  import nemo
  import pytorch_lightning as pl
  # NeMo uses PyTorch Lightning for training orchestration
  # trainer = pl.Trainer(max_epochs=N, devices=1, accelerator="gpu")
  # model = YourNeMoModel(cfg)
  # trainer.fit(model)`,

  'tensorrt-llm': `TensorRT-LLM (LLM inference engine):
  # Build engine: trtllm-build --checkpoint_dir ./ckpt --output_dir ./engine
  # Python API:
  import tensorrt_llm
  from tensorrt_llm import LLM, SamplingParams
  llm = LLM(model="./engine")
  output = llm.generate(["prompt"], sampling_params=SamplingParams(temperature=0.8))`,

  'tensorrt': `TensorRT (non-LLM inference):
  import tensorrt as trt
  # Build engine from ONNX:
  # trtexec --onnx=model.onnx --saveEngine=model.plan --fp16
  # Python inference:
  import pycuda.driver as cuda
  # Load engine, create context, run inference`,

  'cuda': `CUDA Toolkit:
  # CUDA is typically used via PyTorch or other frameworks
  import torch
  device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
  tensor = torch.randn(1000, device=device)`,

  'ngc': `NGC Catalog:
  # Pull containers: docker pull nvcr.io/nvidia/pytorch:24.01-py3
  # Pull models: ngc registry model download-version nvidia/model_name:version
  # Browse: catalog.ngc.nvidia.com`,

  'ai-enterprise': `NVIDIA AI Enterprise:
  # Enterprise deployment via Helm charts on Kubernetes
  # helm install triton-server nvaie/triton-inference-server
  # Includes monitoring, logging, security, and SLA support
  # Configure via values.yaml`,
};

// ── Universal patterns — always included when relevant to path ──────────────

/**
 * Real public dataset download patterns. The notebook generator should use these
 * instead of assuming data files exist locally. Matches NVIDIA's own notebook
 * pattern (e.g. embedding-finetuning uses SPECTER via HuggingFace datasets).
 */
const DATASET_AUTO_DOWNLOAD = `DATASET AUTO-DOWNLOAD (use when training/fine-tuning/evaluating — do NOT assume data exists):
  # Option A — HuggingFace datasets (best for NLP/text, recommendations)
  from datasets import load_dataset
  ds = load_dataset("specter", split="train[:10%]")  # SPECTER, MovieLens, etc.

  # Option B — torchaudio datasets (best for speech)
  import torchaudio
  ds = torchaudio.datasets.LIBRISPEECH(root="./data", url="dev-clean", download=True)

  # Option C — urllib for custom URLs (structured data, Parquet, CSV)
  import urllib.request, os
  url = "https://raw.githubusercontent.com/.../sample.parquet"
  if not os.path.exists("data/sample.parquet"):
      os.makedirs("data", exist_ok=True)
      urllib.request.urlretrieve(url, "data/sample.parquet")

  # Option D — synthetic data (fallback when no public dataset matches)
  import pandas as pd, numpy as np
  df = pd.DataFrame({"user_id": np.random.randint(0, 1000, 10000), ...})

  Preferred dataset by domain:
  - recommendations: MovieLens, Amazon-Reviews
  - speech/ASR: LibriSpeech, CommonVoice
  - clinical text: MIMIC-III-demo (requires credential; fall back to synthetic)
  - fraud detection: PaySim synthetic, Kaggle CreditCardFraud
  - general NLP: HuggingFace "glue", "specter"`;

/**
 * Pretrained model auto-download via NeMo/HuggingFace. Beats loading local
 * checkpoints that don't exist.
 */
const PRETRAINED_AUTO_DOWNLOAD = `PRETRAINED MODEL AUTO-DOWNLOAD (prefer this over loading local .nemo files):
  # NeMo ASR
  from nemo.collections.asr.models import EncDecCTCModelBPE
  asr = EncDecCTCModelBPE.from_pretrained("nvidia/stt_en_conformer_ctc_small")

  # NeMo NLP
  from nemo.collections.nlp.models import TextClassificationModel
  # Use from_pretrained or restore_from with auto-download

  # HuggingFace transformers (fallback)
  from transformers import AutoModel, AutoTokenizer
  model = AutoModel.from_pretrained("nvidia/NV-Embed-v2")

  # After fine-tuning, save with: model.save_to("./my_model.nemo")`;

/**
 * NeMo Microservices SDK — the declarative pattern NVIDIA's own
 * embedding-finetuning notebook uses. Replaces fragile subprocess CLI calls.
 */
const NEMO_MICROSERVICES_SDK = `NeMo Microservices SDK (declarative orchestration — use instead of subprocess CLI):
  # This is how NVIDIA's GenerativeAIExamples run training/deployment/eval.
  # Install: pip install nemo-microservices
  from nemo_microservices import NeMoMicroservices

  nemo = NeMoMicroservices(
      base_url=os.environ.get("NEMO_MS_URL", "http://nemo-ms.local"),
      api_key=os.environ["NVIDIA_API_KEY"],
  )

  # Create a training config
  config = nemo.customization.configs.create(
      name="my-finetune",
      base_model="nvidia/nv-embedqa-e5-v5",
      training_params={"epochs": 1, "batch_size": 32},
  )

  # Launch job
  job = nemo.customization.jobs.create(config_id=config.id, dataset_id="my-dataset")

  # Poll until done
  import time
  while job.status not in ("completed", "failed"):
      time.sleep(30)
      job = nemo.customization.jobs.get(job.id)
      print(f"Job {job.id} status: {job.status}")

  # Deploy as NIM
  deployment = nemo.deployment.model_deployments.create(
      model_id=job.model_id, gpu_type="A100"
  )

  # Evaluate
  eval_job = nemo.evaluation.jobs.create(
      model_endpoint=deployment.endpoint, benchmark="scidocs"
  )`;

/**
 * Runtime environment detection — graceful degradation when GPUs/services
 * are missing. Lets notebooks run in more environments.
 */
const ENV_DETECTION = `ENVIRONMENT DETECTION (graceful degradation — include early in notebook):
  import shutil, os
  import torch

  HAS_GPU = torch.cuda.is_available()
  HAS_TRITON = shutil.which("tritonserver") is not None
  HAS_KUBECTL = shutil.which("kubectl") is not None
  HAS_HELM = shutil.which("helm") is not None

  print(f"GPU available: {HAS_GPU}")
  if HAS_GPU:
      print(f"  Device: {torch.cuda.get_device_name(0)}")
      print(f"  Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

  # Use these flags later to skip steps that require unavailable tooling.`;

/**
 * Returns grounding patterns only for services in the given path.
 * Universal patterns (dataset, pretrained, env detection) are always included.
 * NeMo Microservices SDK is included when training/fine-tuning is in the path.
 */
export function getRelevantPatterns(serviceIds: string[]): string {
  const relevant = serviceIds
    .map((id) => PATTERNS[id])
    .filter(Boolean);

  const sections: string[] = [];

  // Universal patterns — always include (lightweight context)
  sections.push(ENV_DETECTION);
  sections.push(DATASET_AUTO_DOWNLOAD);
  sections.push(PRETRAINED_AUTO_DOWNLOAD);

  // Include Microservices SDK when path has training/fine-tuning
  const hasTraining = serviceIds.some((id) =>
    ['nemo', 'nemo-curator', 'nemo-evaluator', 'nemo-gym', 'megatron-lm'].includes(id)
  );
  if (hasTraining) {
    sections.push(NEMO_MICROSERVICES_SDK);
  }

  // Service-specific patterns
  if (relevant.length > 0) {
    sections.push(...relevant);
  }

  if (sections.length === 0) return '';

  return [
    'REAL NVIDIA CODE PATTERNS — use ONLY these APIs, do NOT invent function names:',
    '',
    ...sections,
  ].join('\n\n');
}
