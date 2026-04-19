/**
 * lib/allowed-apis.ts
 *
 * Machine-readable manifest of real NVIDIA Python symbols per service.
 * Source of truth for what the notebook-generator is allowed to import
 * and call under an NVIDIA-namespace package.
 *
 * WHY: prompt-based grounding is suggestion. This manifest is enforcement.
 * The AST validator (lib/validators/notebook-ast.ts) walks every code cell,
 * extracts imports + attribute chains, and rejects symbols that claim to be
 * from an NVIDIA package but aren't in this manifest. Hallucinated APIs
 * (like `subprocess.run(["nemo", "train", ...])` or `nemo_curator.magic.X`)
 * become structurally impossible to ship.
 *
 * SCOPE: covers all 25 services in data/nvidia.ts. Depth varies by how much
 * code the model actually writes against that service — `nemo-curator` has
 * a dozen symbols, `brev` is infrastructure (nothing to import from a
 * notebook) so has an empty symbol list.
 *
 * SOURCES (scraped / read manually):
 *   - nemo_curator     github.com/NVIDIA/NeMo-Curator
 *   - nemoguardrails   github.com/NVIDIA/NeMo-Guardrails
 *   - tritonclient     github.com/triton-inference-server/client
 *   - modelopt         github.com/NVIDIA/TensorRT-Model-Optimizer
 *   - tensorrt_llm     github.com/NVIDIA/TensorRT-LLM
 *   - tensorrt         docs.nvidia.com/deeplearning/tensorrt
 *   - cudf / dask_cudf github.com/rapidsai/cudf
 *   - cuml             github.com/rapidsai/cuml
 *   - nemo             github.com/NVIDIA/NeMo
 *   - nemo_microservices  github.com/NVIDIA/NeMo (microservices)
 *   - cuopt            docs.nvidia.com/cuopt
 *   - openai (for NIM endpoints) — OpenAI-compatible client
 *
 * Procedures: docs/procedures/04-grounding-manifest.md
 */

export type ServiceId = string;

export interface AllowedAPI {
  /**
   * Pip-installable package name (e.g. "nemo-curator"). Used to validate
   * that `pip install X` lines reference real packages.
   */
  pipPackage: string | null;
  /**
   * Top-level import roots this service exposes. Any `import X` or
   * `from X import Y` statement whose X starts with one of these roots
   * is considered "claiming to be from this service" — and therefore
   * subject to validation against `allowedSymbols`.
   *
   * An empty array means "nothing to import from a notebook" (e.g. Brev,
   * NGC, AI Workbench — these are infra, not SDKs).
   */
  importRoots: string[];
  /**
   * Fully-qualified dotted paths to public symbols (classes / functions /
   * constants). E.g. `nemo_curator.pipeline.Pipeline`,
   * `tritonclient.http.InferenceServerClient`.
   *
   * Matching rule: a symbol is valid if its FQN exactly matches one of
   * these OR if it is a prefix of one (so `from nemo_curator.pipeline
   * import Pipeline` is valid because `nemo_curator.pipeline.Pipeline`
   * is listed, and the `from ... import Pipeline` part is checked by
   * verifying the full path exists).
   */
  allowedSymbols: string[];
  /**
   * Human-readable fix suggestion shown in validator error messages when
   * a notebook uses a fake symbol under this service's namespace.
   */
  fixHint?: string;
  /**
   * True if the service only makes sense in LLM / generative workloads.
   * Redundant with lib/validators/path.ts LLM_ONLY_SERVICES but kept here
   * so the AST validator can independently warn (e.g. if a non-LLM path
   * sneaks an `import nemoguardrails` through).
   */
  llmOnly?: boolean;
}

// ── Catalog entries ──────────────────────────────────────────────────────────

export const ALLOWED_APIS: Record<ServiceId, AllowedAPI> = {
  // ── ACCESS LAYER — infra, no imports expected ─────────────────────────
  'build-nvidia': {
    pipPackage: null,
    importRoots: [],
    allowedSymbols: [],
    fixHint: 'NVIDIA Build is a hosted API catalog; it has no Python SDK. Use `openai` client against https://integrate.api.nvidia.com/v1 instead.',
  },
  'brev': {
    pipPackage: null,
    importRoots: [],
    allowedSymbols: [],
    fixHint: 'Brev is a GPU instance provider — no Python SDK. Provisioning is done via the web UI or CLI.',
  },
  'ngc': {
    pipPackage: null,
    importRoots: [],
    allowedSymbols: [],
    fixHint: 'NGC is a container / model registry accessed via `docker pull nvcr.io/...` or `ngc registry` CLI. Not a Python package.',
  },
  'dgx-cloud': {
    pipPackage: null,
    importRoots: [],
    allowedSymbols: [],
    fixHint: 'DGX Cloud is infrastructure accessed via the web console. No Python SDK.',
  },

  // ── SDK LAYER ─────────────────────────────────────────────────────────
  'cuda': {
    pipPackage: null, // CUDA toolkit installed system-wide; used via frameworks.
    importRoots: ['pycuda', 'cupy', 'cuda'],
    allowedSymbols: [
      // CUDA is typically accessed via higher-level libs (PyTorch, CuPy).
      // These are the most common direct imports.
      'pycuda.driver',
      'pycuda.autoinit',
      'cupy.array',
      'cupy.asarray',
      'cupy.ndarray',
    ],
    fixHint: 'CUDA is normally accessed via PyTorch (`torch.cuda`) or CuPy. Direct PyCUDA usage is rare in generated notebooks.',
  },
  'cudnn': {
    pipPackage: null,
    importRoots: [],
    allowedSymbols: [],
    fixHint: 'cuDNN is a C library; accessed implicitly through PyTorch / TensorFlow. Do not import directly in Python.',
  },
  'tensorrt': {
    pipPackage: 'tensorrt',
    importRoots: ['tensorrt'],
    allowedSymbols: [
      'tensorrt.Builder',
      'tensorrt.NetworkDefinition',
      'tensorrt.Logger',
      'tensorrt.Runtime',
      'tensorrt.IExecutionContext',
      'tensorrt.OnnxParser',
      'tensorrt.BuilderConfig',
      'tensorrt.ICudaEngine',
      'tensorrt.NetworkDefinitionCreationFlag',
      'tensorrt.DataType',
      'tensorrt.Dims',
    ],
    fixHint: 'TensorRT Python API: build engines via `tensorrt.Builder`, parse ONNX via `tensorrt.OnnxParser`, run inference via `tensorrt.Runtime`.',
  },
  'tensorrt-llm': {
    pipPackage: 'tensorrt-llm',
    importRoots: ['tensorrt_llm'],
    allowedSymbols: [
      'tensorrt_llm.LLM',
      'tensorrt_llm.SamplingParams',
      'tensorrt_llm.BuildConfig',
      'tensorrt_llm.llmapi.LLM',
      'tensorrt_llm.llmapi.SamplingParams',
      'tensorrt_llm.logger',
      'tensorrt_llm.builder.Builder',
      'tensorrt_llm.runtime.ModelRunner',
    ],
    llmOnly: true,
    fixHint: 'Use `from tensorrt_llm import LLM, SamplingParams` for inference. CLI: `trtllm-build` for engine build.',
  },

  // ── FRAMEWORK LAYER ───────────────────────────────────────────────────
  'nemo': {
    pipPackage: 'nemo-toolkit',
    importRoots: ['nemo', 'pytorch_lightning', 'lightning'],
    allowedSymbols: [
      'nemo.collections.asr.models.EncDecCTCModel',
      'nemo.collections.asr.models.EncDecCTCModelBPE',
      'nemo.collections.asr.models.EncDecRNNTBPEModel',
      'nemo.collections.nlp.models.TextClassificationModel',
      'nemo.collections.nlp.models.QAModel',
      'nemo.collections.tts.models.FastPitchModel',
      'nemo.collections.tts.models.HifiGanModel',
      'nemo.collections.llm',
      'nemo.core.classes.ModelPT',
      'nemo.core.config.hydra_runner',
      'nemo.utils.exp_manager',
      'pytorch_lightning.Trainer',
      'lightning.pytorch.Trainer',
    ],
    fixHint: 'NeMo uses PyTorch Lightning for training. Load pretrained via `Model.from_pretrained("nvidia/...")`. There is NO `nemo train` CLI — use the Python API.',
  },
  'nemo-curator': {
    pipPackage: 'nemo-curator',
    importRoots: ['nemo_curator'],
    allowedSymbols: [
      'nemo_curator.pipeline.Pipeline',
      'nemo_curator.stages.base.ProcessingStage',
      'nemo_curator.modules.ExactDuplicates',
      'nemo_curator.modules.FuzzyDuplicatesConfig',
      'nemo_curator.modules.Modify',
      'nemo_curator.modules.Sequential',
      'nemo_curator.modules.ScoreFilter',
      'nemo_curator.filters.DocumentFilter',
      'nemo_curator.datasets.DocumentDataset',
    ],
    fixHint: 'NeMo Curator pattern: build a `Pipeline([ProcessingStage(...)])` and call `pipeline.run(input_path)`. See github.com/NVIDIA/NeMo-Curator/tutorials.',
  },
  'nemo-guardrails': {
    pipPackage: 'nemoguardrails',
    importRoots: ['nemoguardrails'],
    allowedSymbols: [
      'nemoguardrails.LLMRails',
      'nemoguardrails.RailsConfig',
      'nemoguardrails.actions.action',
    ],
    llmOnly: true,
    fixHint: 'Guardrails pattern: `config = RailsConfig.from_path("./config")`; `rails = LLMRails(config)`; `response = rails.generate(messages=[...])`. Requires .co Colang files.',
  },
  'nemo-retriever': {
    pipPackage: null, // NeMo Retriever is primarily an NIM — accessed via HTTP/OpenAI client.
    importRoots: [],
    allowedSymbols: [],
    llmOnly: true,
    fixHint: 'NeMo Retriever is served as an NIM endpoint. Call it via the `openai` client against your retriever endpoint URL, or use `requests`.',
  },
  'ai-workbench': {
    pipPackage: null,
    importRoots: [],
    allowedSymbols: [],
    fixHint: 'AI Workbench is a dev environment manager — used via web UI / CLI, not imported in notebook code.',
  },
  'rapids': {
    pipPackage: 'cudf-cu12', // depends on CUDA version; rapidsai org has several.
    importRoots: ['cudf', 'dask_cudf', 'cuml', 'cugraph', 'cuspatial', 'cuxfilter'],
    allowedSymbols: [
      // cuDF — GPU DataFrames
      'cudf.DataFrame',
      'cudf.Series',
      'cudf.read_csv',
      'cudf.read_parquet',
      'cudf.read_json',
      'cudf.concat',
      'cudf.merge',
      'cudf.get_dummies',
      'cudf.from_pandas',
      // Dask-cuDF — out-of-core GPU DataFrames
      'dask_cudf.read_parquet',
      'dask_cudf.read_csv',
      'dask_cudf.from_cudf',
      // cuML — GPU ML models
      'cuml.ensemble.RandomForestClassifier',
      'cuml.ensemble.RandomForestRegressor',
      'cuml.linear_model.LogisticRegression',
      'cuml.linear_model.LinearRegression',
      'cuml.cluster.KMeans',
      'cuml.neighbors.NearestNeighbors',
      'cuml.preprocessing.StandardScaler',
      // cuML metrics — real module, was missing from v1. Added 2026-04-19.
      'cuml.metrics.accuracy_score',
      'cuml.metrics.precision_score',
      'cuml.metrics.recall_score',
      'cuml.metrics.f1_score',
      'cuml.metrics.roc_auc_score',
      'cuml.metrics.confusion_matrix',
      'cuml.metrics.log_loss',
      // cuGraph
      'cugraph.Graph',
      'cugraph.pagerank',
    ],
    fixHint: 'RAPIDS is pandas/sklearn-on-GPU. `cudf.read_parquet` → DataFrame, `cuml` for ML, `cuml.metrics` for scoring. API mirrors pandas / sklearn where possible.',
  },
  'nemotron': {
    pipPackage: null, // Nemotron is accessed as a model via NIM or HuggingFace.
    importRoots: ['transformers'],
    allowedSymbols: [
      'transformers.AutoModelForCausalLM',
      'transformers.AutoTokenizer',
    ],
    llmOnly: true,
    fixHint: 'Nemotron is an open-weights LLM family. Access via HuggingFace (`AutoModelForCausalLM.from_pretrained("nvidia/nemotron-...")`) or NIM endpoint using `openai` client.',
  },
  'nemo-agent-toolkit': {
    pipPackage: 'nemo-agent-toolkit',
    importRoots: ['nemo_agent_toolkit'],
    allowedSymbols: [
      // Public surface is still evolving — keep shallow and permissive.
    ],
    fixHint: 'NeMo Agent Toolkit API is evolving; prefer the official tutorials for current imports.',
  },
  'blueprints': {
    pipPackage: null,
    importRoots: [],
    allowedSymbols: [],
    fixHint: 'NVIDIA Blueprints are reference apps (containers / Helm charts), not Python SDKs. Deploy via docker-compose or Helm.',
  },

  // ── AGENT LAYER ──────────────────────────────────────────────────────
  'cuopt': {
    pipPackage: 'cuopt',
    importRoots: ['cuopt'],
    allowedSymbols: [
      'cuopt.Solver',
    ],
    fixHint: 'cuOpt is a GPU-accelerated optimisation solver. Build a data_model, create a Solver, call solve().',
  },
  'nemo-evaluator': {
    // Evaluator is a CLI-first tool; Python access via subprocess.
    pipPackage: 'nemo-evaluator-launcher',
    importRoots: [],
    allowedSymbols: [],
    llmOnly: true,
    fixHint: 'NeMo Evaluator is a CLI: `nemo-evaluator-launcher run --config eval.yaml`. From a notebook use `subprocess.run(["nemo-evaluator-launcher", ...])`.',
  },
  'nemo-gym': {
    pipPackage: 'nemo-rl',
    importRoots: ['nemo_rl'],
    allowedSymbols: [],
    llmOnly: true,
    fixHint: 'NeMo Gym / NeMo-RL is for RLHF. Training is orchestrated via YAML configs + `nemo_rl` launchers.',
  },
  'megatron-lm': {
    pipPackage: 'megatron-core',
    importRoots: ['megatron'],
    allowedSymbols: [
      'megatron.core.parallel_state',
      'megatron.core.tensor_parallel',
      'megatron.core.models.gpt.GPTModel',
    ],
    llmOnly: true,
    fixHint: 'Megatron-LM is for large-scale LLM pretraining via model/tensor/pipeline parallelism. Invoked via launch scripts, not a simple import.',
  },
  'model-optimizer': {
    pipPackage: 'nvidia-modelopt',
    importRoots: ['modelopt'],
    allowedSymbols: [
      'modelopt.torch.quantization.quantize',
      'modelopt.torch.quantization.mtq',
      'modelopt.torch.sparsity.sparsify',
      'modelopt.torch.prune.prune',
      'modelopt.torch.distill.distill',
      'modelopt.torch.export.export_tensorrt_llm_checkpoint',
      'modelopt.onnx.quantization',
    ],
    fixHint: 'ModelOpt: `import modelopt.torch.quantization as mtq; mtq.quantize(model, config)`. Supports INT8/FP8/INT4.',
  },

  // ── SERVING LAYER ────────────────────────────────────────────────────
  'triton': {
    pipPackage: 'tritonclient', // there are [http] / [grpc] / [all] extras.
    importRoots: ['tritonclient'],
    allowedSymbols: [
      'tritonclient.http.InferenceServerClient',
      'tritonclient.http.InferInput',
      'tritonclient.http.InferRequestedOutput',
      'tritonclient.grpc.InferenceServerClient',
      'tritonclient.grpc.InferInput',
      'tritonclient.grpc.InferRequestedOutput',
      'tritonclient.utils.np_to_triton_dtype',
      'tritonclient.utils.triton_to_np_dtype',
    ],
    fixHint: 'Triton client: `httpclient.InferenceServerClient(url="localhost:8000")`; set_data_from_numpy() on InferInput; call client.infer(...).',
  },
  'nim': {
    // NIM is accessed via the OpenAI-compatible client. `openai` is the real package.
    pipPackage: 'openai',
    importRoots: ['openai'],
    allowedSymbols: [
      'openai.OpenAI',
      'openai.AsyncOpenAI',
      'openai.types.chat.ChatCompletion',
      'openai.types.chat.ChatCompletionMessage',
    ],
    fixHint: 'NIM endpoints are OpenAI-compatible. `from openai import OpenAI; client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=os.environ["NVIDIA_API_KEY"])`.',
  },

  // ── ENTERPRISE LAYER ─────────────────────────────────────────────────
  'ai-enterprise': {
    pipPackage: null,
    importRoots: [],
    allowedSymbols: [],
    fixHint: 'NVIDIA AI Enterprise is a deployment platform (Kubernetes / Helm). Not a Python SDK; configure via values.yaml.',
  },
};

// ── Helpers consumed by the AST validator ────────────────────────────────────

/**
 * Every import root across the catalog. An import in a code cell only becomes
 * subject to NVIDIA-specific validation if it starts with one of these — so
 * legitimate `import numpy as np` or `import pandas` passes through untouched.
 */
export function getAllNvidiaImportRoots(): Set<string> {
  const roots = new Set<string>();
  for (const api of Object.values(ALLOWED_APIS)) {
    for (const root of api.importRoots) roots.add(root);
  }
  return roots;
}

/**
 * Which service (by catalog id) claims a given import root. Used to tailor
 * error messages: "symbol X isn't in nemo_curator's allowed list — valid
 * symbols are: [...]".
 */
export function findServiceForImportRoot(root: string): ServiceId | null {
  for (const [serviceId, api] of Object.entries(ALLOWED_APIS)) {
    // Longest-prefix match wins: tritonclient.http should match triton (root=tritonclient)
    // not something else. We check prefix-of-dot pattern.
    for (const allowedRoot of api.importRoots) {
      if (root === allowedRoot || root.startsWith(allowedRoot + '.')) {
        return serviceId;
      }
    }
  }
  return null;
}

/**
 * Does a given fully-qualified symbol (e.g. `tritonclient.http.InferenceServerClient`)
 * exist in the manifest? The check is prefix-tolerant: `tritonclient.http`
 * is considered valid if any symbol *starts with* `tritonclient.http.`, so
 * submodule imports (`from tritonclient.http import X`) don't get false flags.
 */
export function isSymbolAllowed(fqn: string, serviceId: ServiceId): boolean {
  const api = ALLOWED_APIS[serviceId];
  if (!api) return false;
  if (api.importRoots.length === 0) return false; // infra service — no code imports ok
  for (const sym of api.allowedSymbols) {
    if (sym === fqn) return true;
    // submodule check: allow `nemo_curator.pipeline` if manifest has `nemo_curator.pipeline.Pipeline`
    if (sym.startsWith(fqn + '.')) return true;
    // allow `nemo_curator.pipeline.Pipeline.something` if we listed the class
    if (fqn.startsWith(sym + '.')) return true;
  }
  return false;
}

/**
 * Get a compact sample of valid symbols for a service — used in error
 * messages so the model has concrete options to pick from on re-prompt.
 */
export function getAllowedSymbolsSample(serviceId: ServiceId, max: number = 6): string[] {
  const api = ALLOWED_APIS[serviceId];
  if (!api) return [];
  return api.allowedSymbols.slice(0, max);
}

/**
 * For services that have no importable Python surface (access/enterprise
 * layer), the AST validator shouldn't silently accept `import brev` —
 * it should produce a targeted error.
 */
export function isInfraOnlyService(serviceId: ServiceId): boolean {
  const api = ALLOWED_APIS[serviceId];
  return Boolean(api && api.importRoots.length === 0 && api.pipPackage === null);
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWN-FAKE SYMBOLS — high-confidence hallucinations the 120B has emitted
// in live runs. The ordinary allowed-symbol check would already flag these
// for being absent, but listing them here lets us provide a SPECIFIC fix
// hint ("use X instead") rather than a generic "not in allowed list".
//
// When extending: only add symbols that are confidently fake AND come with
// a concrete alternative. Do NOT add symbols we're unsure about — false
// positives on a known-fake list are worse than misses.
// ─────────────────────────────────────────────────────────────────────────────

export interface KnownFakeEntry {
  /** The exact symbol / import path the model hallucinates. */
  symbol: string;
  /** Service this is being misattributed to (from the import root). */
  service: ServiceId;
  /** Concrete correction the re-prompt should request. */
  fixHint: string;
}

export const KNOWN_FAKE_SYMBOLS: KnownFakeEntry[] = [
  // Observed 2026-04-19 fraud-notebook live run (correlation 3e2dd077).
  // Model wrote `from cuml.neural_network import MLPClassifier` — cuML has
  // no `neural_network` module. Real alternatives: a cuml tree/linear model,
  // or a PyTorch MLP (which RAPIDS integrates with via cudf -> torch.Tensor).
  {
    symbol: 'cuml.neural_network',
    service: 'rapids',
    fixHint:
      'cuml.neural_network does not exist. For tabular ML use cuml.ensemble.RandomForestClassifier, cuml.linear_model.LogisticRegression, or cuml.ensemble.GradientBoostingClassifier. For neural-net tabular, use PyTorch directly with cudf→torch.from_dlpack.',
  },
  {
    symbol: 'cuml.neural_network.MLPClassifier',
    service: 'rapids',
    fixHint:
      'cuml.neural_network.MLPClassifier does not exist. Options: (a) sklearn.neural_network.MLPClassifier on CPU, (b) PyTorch nn.Sequential on GPU, (c) swap to cuml.ensemble.RandomForestClassifier (fast, GPU, well-suited to tabular fraud).',
  },

  // `from tensorrt import nvinfer1` — nvinfer1 is the C++ namespace, not a
  // Python module. Caused Cell 23 to break. Observed twice now.
  {
    symbol: 'tensorrt.nvinfer1',
    service: 'tensorrt',
    fixHint:
      'tensorrt.nvinfer1 is a C++ namespace, not a Python import. Remove the import. Access TensorRT types directly from the `tensorrt` module (e.g. `trt.Builder`, `trt.Logger`, `trt.Runtime`).',
  },

  // Sometimes emitted as `from nemo.core import Dataset, DataLoader` — no
  // such classes in nemo.core (NeMo uses torch.utils.data.Dataset directly).
  {
    symbol: 'nemo.core.Dataset',
    service: 'nemo',
    fixHint:
      'nemo.core.Dataset does not exist. Use torch.utils.data.Dataset (NeMo models accept standard PyTorch dataloaders). `from torch.utils.data import Dataset, DataLoader`.',
  },
  {
    symbol: 'nemo.core.DataLoader',
    service: 'nemo',
    fixHint:
      'nemo.core.DataLoader does not exist. Use torch.utils.data.DataLoader.',
  },
  {
    symbol: 'nemo.collections.nlp.models.language_modeling.bert',
    service: 'nemo',
    fixHint:
      'This path does not exist in NeMo. For BERT-family models use `from transformers import AutoModel` (HuggingFace) — NeMo does not expose a `bert` submodule under language_modeling.',
  },
];

/**
 * Lookup: is this fully-qualified symbol a known hallucination? Prefix-match
 * so `cuml.neural_network.MLPClassifier` triggers whether the code wrote
 * `from cuml.neural_network import MLPClassifier` (fqn = that) or
 * `cuml.neural_network.MLPClassifier(...)` (attr chain same).
 */
export function findKnownFake(fqn: string): KnownFakeEntry | null {
  for (const entry of KNOWN_FAKE_SYMBOLS) {
    if (fqn === entry.symbol || fqn.startsWith(entry.symbol + '.')) {
      return entry;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED SYMBOLS — real symbols that existed in older versions but were
// removed / renamed in the current SDK. Separate from known-fakes because
// the action is different: "this is real but obsolete; here is the modern
// equivalent." Observed primarily with TensorRT (big API break in 8.0).
// ─────────────────────────────────────────────────────────────────────────────

export interface DeprecatedEntry {
  /** Attribute or method name (without the parent object prefix). */
  name: string;
  /** Parent type/class/module for context (e.g. "Builder", "ICudaEngine"). */
  parent: string;
  /** Service id this belongs to. */
  service: ServiceId;
  /** Version in which this was removed / renamed. */
  sinceVersion?: string;
  /** Modern replacement pattern. */
  fixHint: string;
}

export const DEPRECATED_SYMBOLS: DeprecatedEntry[] = [
  // TensorRT ≤7 → 8.0 API break. The model likes to emit the old API because
  // it was in most training data but was removed years ago.
  {
    name: 'max_workspace_size',
    parent: 'Builder',
    service: 'tensorrt',
    sinceVersion: '8.0',
    fixHint:
      '`builder.max_workspace_size` was removed in TensorRT 8.0. Use `config = builder.create_builder_config(); config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 1 << 30)`.',
  },
  {
    name: 'fp16_mode',
    parent: 'Builder',
    service: 'tensorrt',
    sinceVersion: '8.0',
    fixHint:
      '`builder.fp16_mode = True` was removed in TensorRT 8.0. Use `config.set_flag(trt.BuilderFlag.FP16)`.',
  },
  {
    name: 'int8_mode',
    parent: 'Builder',
    service: 'tensorrt',
    sinceVersion: '8.0',
    fixHint:
      '`builder.int8_mode = True` was removed in TensorRT 8.0. Use `config.set_flag(trt.BuilderFlag.INT8)` and provide an int8 calibrator.',
  },
  {
    name: 'build_cuda_engine',
    parent: 'Builder',
    service: 'tensorrt',
    sinceVersion: '8.0',
    fixHint:
      '`builder.build_cuda_engine(network)` was removed in TensorRT 8.0. Use `serialized = builder.build_serialized_network(network, config)` then `runtime.deserialize_cuda_engine(serialized)`.',
  },
  {
    name: 'max_batch_size',
    parent: 'ICudaEngine',
    service: 'tensorrt',
    sinceVersion: '8.5',
    fixHint:
      '`engine.max_batch_size` is deprecated; explicit-batch engines specify batch in the input tensor shape. Set batch via the dynamic-shapes optimisation profile on the IBuilderConfig.',
  },
  {
    name: 'binding_is_input',
    parent: 'ICudaEngine',
    service: 'tensorrt',
    sinceVersion: '8.5',
    fixHint:
      '`engine.binding_is_input(binding)` is deprecated. Use `engine.get_tensor_mode(name) == trt.TensorIOMode.INPUT`.',
  },
  {
    name: 'get_binding_shape',
    parent: 'ICudaEngine',
    service: 'tensorrt',
    sinceVersion: '8.5',
    fixHint:
      '`engine.get_binding_shape(binding)` is deprecated. Use `engine.get_tensor_shape(name)`.',
  },
  {
    name: 'execute_async',
    parent: 'IExecutionContext',
    service: 'tensorrt',
    sinceVersion: '8.5',
    fixHint:
      '`context.execute_async(batch_size, bindings, stream)` is deprecated. Use `context.execute_async_v3(stream_handle)` with `set_tensor_address(name, ptr)` for each IO tensor.',
  },
];

/**
 * Lookup: is this `parent.name` attribute chain a deprecated API call?
 * Used by the AST validator when it walks attribute chains like
 * `builder.max_workspace_size = ...` or `context.execute_async(...)`.
 */
export function findDeprecated(parent: string, name: string): DeprecatedEntry | null {
  for (const entry of DEPRECATED_SYMBOLS) {
    // Match on exact parent (Builder, ICudaEngine) or lowercase common names
    // (builder, engine, context) as used at call sites.
    if (entry.name !== name) continue;
    const hints = [
      entry.parent.toLowerCase(),
      entry.parent,
    ];
    if (hints.includes(parent)) return entry;
    // Also accept common variable names — model tends to use these.
    const commonVarNames: Record<string, string[]> = {
      Builder: ['builder'],
      ICudaEngine: ['engine'],
      IExecutionContext: ['context', 'ctx', 'exec_context'],
    };
    if (commonVarNames[entry.parent]?.includes(parent)) return entry;
  }
  return null;
}
