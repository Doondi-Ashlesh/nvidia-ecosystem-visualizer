/**
 * NVIDIA AI Ecosystem Data
 *
 * All service descriptions are sourced exclusively from official NVIDIA
 * documentation (docs.nvidia.com, developer.nvidia.com, official product pages).
 * Source URLs are noted per entry in code comments.
 */

import type { Service, Workflow } from '@/types/ecosystem';

// ---------------------------------------------------------------------------
// SERVICES
// ---------------------------------------------------------------------------

export const NVIDIA_SERVICES: Service[] = [

  // ── ACCESS ────────────────────────────────────────────────────────────────

  {
    id: 'build-nvidia',
    name: 'NVIDIA Build',
    shortDescription: 'Try NIM APIs in the browser — no setup required.',
    // Source: official NIM docs — "API catalog (cloud-hosted)" deployment option
    fullDescription:
      'The hosted API catalog for NVIDIA NIM microservices. Try state-of-the-art LLMs, vision, speech, and biology models directly from the browser before deploying them. Obtain API keys to integrate NIM endpoints into your applications. Referenced in official NIM docs as the "API catalog (cloud-hosted)" deployment option.',
    officialUrl: 'https://build.nvidia.com',
    layer: 'access',
    tags: ['playground', 'API', 'NIM', 'no-setup'],
    connections: ['nim'],
  },
  {
    id: 'brev',
    name: 'NVIDIA Brev',
    shortDescription: 'Instant GPU access with automatic environment setup.',
    // Source: developer.nvidia.com/brev
    fullDescription:
      'Provides streamlined access to NVIDIA GPU instances on popular cloud platforms with automatic environment setup and flexible deployment options, enabling developers to start experimenting instantly. Supports Launchables — preconfigured compute environments with optimized software stacks — for rapid GPU access, AI model development, and collaborative development.',
    officialUrl: 'https://developer.nvidia.com/brev',
    layer: 'access',
    tags: ['GPU', 'cloud', 'dev environment', 'Launchables'],
    connections: ['cuda', 'nim', 'ai-workbench'],
  },
  {
    id: 'ngc',
    name: 'NVIDIA NGC Catalog',
    shortDescription: 'Curated GPU-accelerated containers, models, and resources.',
    // Source: catalog.ngc.nvidia.com official description
    fullDescription:
      'A curated catalog providing GPU-accelerated containers, models, and resources for AI, ML, and HPC. Central hub for production AI frameworks (PyTorch, TensorFlow, NeMo) and SDKs with enterprise-grade support and 36-month security features. Hosts NeMo containers, TensorRT images, Triton-ready containers, NIM microservices, and pre-trained model checkpoints.',
    officialUrl: 'https://catalog.ngc.nvidia.com',
    layer: 'access',
    tags: ['containers', 'models', 'registry', 'HPC', 'enterprise'],
    connections: ['cuda', 'tensorrt', 'nemo', 'nim', 'triton'],
  },
  {
    id: 'dgx-cloud',
    name: 'NVIDIA DGX Cloud',
    shortDescription: "NVIDIA's cloud for building and operating AI at scale.",
    // Source: official NVIDIA DGX Cloud documentation
    fullDescription:
      "NVIDIA's cloud environment for building and operating AI at scale — developing open-source frontier and foundational models, validating new system architectures, and running production AI workloads. Supports large-scale multi-node model training (tens of thousands of GPUs), physical AI, and autonomous vehicle research.",
    officialUrl: 'https://www.nvidia.com/en-us/data-center/dgx-cloud/',
    layer: 'access',
    tags: ['cloud', 'large-scale training', 'multi-node', 'foundational models'],
    connections: ['cuda', 'nemo'],
  },

  // ── SDK / RUNTIME ─────────────────────────────────────────────────────────

  {
    id: 'cuda',
    name: 'NVIDIA CUDA® Toolkit',
    shortDescription: 'Comprehensive dev environment for GPU-accelerated apps.',
    // Source: developer.nvidia.com/cuda-toolkit
    fullDescription:
      'Comprehensive development environment for building GPU-accelerated applications. Provides GPU-accelerated libraries, debugging and optimization tools, a C/C++ compiler, and a runtime library. Used for HPC on workstations and clusters, and scientific computing (drug discovery, astronomy, simulations).',
    officialUrl: 'https://developer.nvidia.com/cuda-toolkit',
    layer: 'sdk',
    tags: ['GPU', 'parallel computing', 'C/C++', 'HPC'],
    connections: ['cudnn', 'tensorrt', 'nemo', 'rapids'],
  },
  {
    id: 'cudnn',
    name: 'NVIDIA cuDNN™',
    shortDescription: 'GPU-accelerated library of deep neural network primitives.',
    // Source: developer.nvidia.com/cudnn
    fullDescription:
      'GPU-accelerated library of primitives for deep neural networks. Delivers highly tuned implementations for convolution, attention, matmul, pooling, and normalization. Reduces multi-day training sessions to hours. Integrates with PyTorch, JAX, TensorFlow, Keras, and other major frameworks.',
    officialUrl: 'https://developer.nvidia.com/cudnn',
    layer: 'sdk',
    tags: ['deep learning', 'GPU primitives', 'training', 'inference'],
    connections: ['tensorrt', 'nemo'],
  },
  {
    id: 'tensorrt',
    name: 'NVIDIA TensorRT™',
    shortDescription: 'Inference optimizer — up to 36× faster than CPU-only platforms.',
    // Source: developer.nvidia.com/tensorrt
    fullDescription:
      'An ecosystem of tools for high-performance deep learning inference, delivering up to 36× speedup vs CPU-only platforms. Optimizes via quantization, layer/tensor fusion, and kernel tuning. Supports LLM inference, CNNs, diffusion models, edge inference, automotive, and video analytics. Paired with Triton Inference Server for production scaling.',
    officialUrl: 'https://developer.nvidia.com/tensorrt',
    layer: 'sdk',
    tags: ['inference', 'optimization', 'quantization', 'LLM', 'CNNs'],
    connections: ['tensorrt-llm', 'triton'],
  },
  {
    id: 'tensorrt-llm',
    name: 'NVIDIA TensorRT-LLM',
    shortDescription: 'TensorRT optimized specifically for LLM inference.',
    // Source: developer.nvidia.com/tensorrt (TensorRT ecosystem components)
    fullDescription:
      'A component of the TensorRT ecosystem specifically optimized for large language model inference. Powers NVIDIA NIM containerized deployments with advanced optimizations tailored to transformer architectures, enabling high-throughput LLM serving at scale.',
    officialUrl: 'https://developer.nvidia.com/tensorrt-llm',
    layer: 'sdk',
    tags: ['LLM', 'inference', 'transformer', 'optimization'],
    connections: ['nim', 'triton'],
  },

  // ── FRAMEWORK / TOOLING ───────────────────────────────────────────────────

  {
    id: 'nemo',
    name: 'NVIDIA NeMo™',
    shortDescription: 'Cloud-native framework for LLMs, multimodal, and speech AI.',
    // Source: docs.nvidia.com/nemo-framework and nvidia.com/en-us/ai-data-science/nemo/
    fullDescription:
      'A comprehensive toolkit for managing the AI agent lifecycle. Scalable and cloud-native generative AI framework built for researchers and developers working on LLMs, Multimodal, and Speech AI. Supports custom LLM development, fine-tuning, RAG applications, agentic AI systems, synthetic data generation, and humanoid robot reasoning.',
    officialUrl: 'https://developer.nvidia.com/nemo-framework',
    layer: 'framework',
    tags: ['LLM', 'fine-tuning', 'speech', 'multimodal', 'agentic AI'],
    connections: ['nim', 'triton', 'nemo-agent-toolkit'],
  },
  {
    id: 'nemo-curator',
    name: 'NVIDIA NeMo™ Curator',
    shortDescription: 'Data preparation and cleaning for LLM pre-training.',
    // Source: official NeMo microservices documentation
    fullDescription:
      'Official NeMo microservice for data preparation and cleaning. Processes multimodal data at scale for LLM pre-training and customization. Provides tooling to clean/filter web-scraped data and prepare domain-specific training corpora. A required step before training with NeMo.',
    officialUrl: 'https://developer.nvidia.com/nemo-curator',
    layer: 'framework',
    tags: ['data curation', 'pre-training', 'dataset', 'LLM'],
    connections: ['nemo'],
  },
  {
    id: 'nemo-guardrails',
    name: 'NVIDIA NeMo™ Guardrails',
    shortDescription: 'Programmable safety and compliance rails for LLM apps.',
    // Source: developer.nvidia.com/nemo-guardrails
    fullDescription:
      'Official NeMo microservice for safety and compliance. Manages dialog security and accuracy in LLM applications. Enables programmable topic, safety, and behavior guardrails for deployed LLM apps, ensuring enterprise compliance and preventing off-topic or harmful outputs.',
    officialUrl: 'https://developer.nvidia.com/nemo-guardrails',
    layer: 'framework',
    tags: ['safety', 'compliance', 'guardrails', 'enterprise', 'LLM'],
    connections: ['nim'],
  },
  {
    id: 'nemo-retriever',
    name: 'NVIDIA NeMo™ Retriever',
    shortDescription: 'Document extraction and RAG pipeline microservices.',
    // Source: official NeMo microservices documentation
    fullDescription:
      'Official NeMo microservice that connects custom models to business data via retrieval-augmented generation. Provides embedding, ingestion, and semantic search for RAG applications. Connects to NIM for LLM inference and embedding model serving over enterprise knowledge bases.',
    officialUrl: 'https://developer.nvidia.com/nemo-retriever',
    layer: 'framework',
    tags: ['RAG', 'embeddings', 'semantic search', 'document retrieval'],
    connections: ['nim'],
  },
  {
    id: 'ai-workbench',
    name: 'NVIDIA AI Workbench',
    shortDescription: 'Free GPU dev environment manager using Git and containers.',
    // Source: nvidia.com/en-us/ai-data-science/ai-workbench/
    fullDescription:
      'A free development environment manager for data scientists and developers to create, customize, and collaborate on AI applications on GPU systems. Uses Git and containers across machines and users. Supports fine-tuning LLMs (Llama 3, Mistral, Phi-3), SDXL, agentic RAG, and full-stack AI development with VS Code, Cursor, JupyterLab.',
    officialUrl: 'https://www.nvidia.com/en-us/ai-data-science/ai-workbench/',
    layer: 'framework',
    tags: ['dev environment', 'fine-tuning', 'containers', 'Git', 'free'],
    connections: ['nim', 'nemo'],
  },
  {
    id: 'rapids',
    name: 'NVIDIA RAPIDS™',
    shortDescription: 'End-to-end GPU-accelerated data science with PyData APIs.',
    // Source: rapids.ai and official NVIDIA RAPIDS docs
    fullDescription:
      'Collection of libraries for running end-to-end data science pipelines on the GPU. Provides familiar PyData APIs (cuDF for pandas at up to 50× faster, cuML for scikit-learn, cuGraph for graph analytics, cuVS for vector search) using optimized CUDA primitives. Available via NGC Catalog.',
    officialUrl: 'https://rapids.ai',
    layer: 'framework',
    tags: ['data science', 'pandas', 'GPU ML', 'graph analytics', 'vector search'],
    connections: [],
  },

  // ── AGENTIC AI ────────────────────────────────────────────────────────────

  {
    id: 'nemotron',
    name: 'NVIDIA Nemotron™',
    shortDescription: 'Open models with open weights, data, and recipes for agents.',
    // Source: developer.nvidia.com/nemotron
    fullDescription:
      'A family of open models with open weights, training data, and recipes for building specialized AI agents. Hybrid Mamba-Transformer MoE architecture with 1M-token context. Three reasoning tiers (Nano, Super, Ultra). Supports reasoning, vision-language, RAG, speech, and safety tasks. Deployed via NIM, vLLM, SGLang, or Ollama.',
    officialUrl: 'https://developer.nvidia.com/nemotron',
    layer: 'agent',
    tags: ['open models', 'reasoning', 'agents', 'Mamba', 'MoE'],
    connections: ['nim', 'nemo-agent-toolkit'],
  },
  {
    id: 'nemo-agent-toolkit',
    name: 'NeMo™ Agent Toolkit',
    shortDescription: 'Open-source library adding intelligence and observability to AI agents.',
    // Source: docs.nvidia.com/nemo-framework — NeMo Agent Toolkit overview
    fullDescription:
      'An open-source AI library that adds intelligence to AI agents across any framework. Provides enterprise-grade instrumentation, observability, and continuous learning for agentic AI systems. Compatible with LangChain, Google ADK, CrewAI, and custom frameworks. Features agent hyperparameter optimization, built-in evaluation tools, and safety middleware for red-teaming agentic workflows.',
    officialUrl: 'https://developer.nvidia.com/nemo-agent-toolkit',
    layer: 'agent',
    tags: ['agents', 'observability', 'LangChain', 'multi-agent', 'evaluation'],
    connections: ['nim', 'blueprints'],
  },
  {
    id: 'blueprints',
    name: 'NVIDIA AI Blueprints',
    shortDescription: 'Production-ready reference applications for generative AI use cases.',
    // Source: nvidia.com/en-us/ai/blueprints/
    fullDescription:
      'Reference applications for generative AI use cases combining partner microservices, AI agents, sample code, customization guides, and deployment documentation. Covers digital customer service avatars, video analytics agents, PDF-to-podcast, network operations, cybersecurity threat detection, manufacturing, and logistics.',
    officialUrl: 'https://www.nvidia.com/en-us/ai/blueprints/',
    layer: 'agent',
    tags: ['reference apps', 'agents', 'production', 'customer service', 'video analytics'],
    connections: ['nim', 'ai-enterprise'],
  },

  // ── SERVING ───────────────────────────────────────────────────────────────

  {
    id: 'triton',
    name: 'NVIDIA Dynamo-Triton',
    shortDescription: 'Deploy AI across all major frameworks with dynamic batching.',
    // Source: developer.nvidia.com/triton-inference-server
    fullDescription:
      'NVIDIA Dynamo is an open-source distributed inference framework designed for high-throughput LLM serving across multi-GPU and multi-node deployments, built on NVIDIA Triton Inference Server. Triton supports all major backends — TensorRT™, PyTorch, TensorFlow, ONNX, OpenVINO, Python, and RAPIDS FIL — with dynamic batching, concurrent model execution, KV cache, model ensembles, Kubernetes integration, and Prometheus metrics. Together, Dynamo and Triton form NVIDIA\'s production serving stack.',
    officialUrl: 'https://developer.nvidia.com/nvidia-dynamo',
    layer: 'serving',
    tags: ['inference server', 'model serving', 'Kubernetes', 'LLM', 'multi-framework'],
    connections: ['ai-enterprise'],
  },
  {
    id: 'nim',
    name: 'NVIDIA NIM™',
    shortDescription: 'Optimized cloud-native AI model deployment — anywhere.',
    // Source: developer.nvidia.com/nim
    fullDescription:
      'A set of optimized cloud-native microservices that shorten time-to-market and simplify deployment of generative AI models across cloud, data center, and GPU-accelerated workstations. Packages optimized inference engines (TensorRT-LLM, vLLM, SGLang), domain-specific CUDA libraries, and industry-standard APIs. Supports LLMs, VLMs, multimodal, speech, image, video, drug discovery, and medical imaging.',
    officialUrl: 'https://developer.nvidia.com/nim',
    layer: 'serving',
    tags: ['microservices', 'inference', 'LLM', 'VLM', 'containerized', 'API'],
    connections: ['ai-enterprise', 'nemo-guardrails'],
  },

  // ── ENTERPRISE ────────────────────────────────────────────────────────────

  {
    id: 'ai-enterprise',
    name: 'NVIDIA AI Enterprise™',
    shortDescription: 'Enterprise AI platform — secure, stable, SLA-backed production.',
    // Source: official NVIDIA AI Enterprise documentation
    fullDescription:
      'Enterprise-grade AI software platform providing secure, stable, and supported AI services with SLAs. Wraps NVIDIA NIM™, NVIDIA Dynamo-Triton™, NVIDIA NGC™ Catalog, and NVIDIA AI Workbench™ for production deployments. Offers 36-month support lifecycle, enterprise security features, and certified infrastructure for regulated industry deployments.',
    officialUrl: 'https://www.nvidia.com/en-us/data-center/products/ai-enterprise/',
    layer: 'enterprise',
    tags: ['enterprise', 'SLA', 'production', 'security', 'support'],
    connections: [],
  },
];

// ---------------------------------------------------------------------------
// WORKFLOWS — based on official NVIDIA use case documentation
// ---------------------------------------------------------------------------

export const NVIDIA_WORKFLOWS: Workflow[] = [
  {
    id: 'try-instantly',
    goal: 'Try AI models instantly',
    description: 'Access NVIDIA NIM APIs from the browser — no setup, no GPU required.',
    difficulty: 'beginner',
    steps: [
      {
        serviceId: 'build-nvidia',
        role: 'Hosted playground',
        action:
          'Open build.nvidia.com to browse NIM microservices. Try LLM, vision, and speech models live in your browser and get an API key for integration.',
      },
      {
        serviceId: 'nim',
        role: 'Inference endpoint',
        action:
          'Use the NIM API key to call optimized model endpoints from your application. Industry-standard APIs let you swap models without changing your code.',
      },
    ],
  },
  {
    id: 'gpu-dev-env',
    goal: 'Set up a GPU dev environment',
    description: 'Provision a configured GPU instance and connect your IDE in minutes.',
    difficulty: 'beginner',
    steps: [
      {
        serviceId: 'brev',
        role: 'GPU provisioning',
        action:
          'Launch a Brev Launchable — a preconfigured GPU instance with NVIDIA drivers and frameworks pre-installed. No manual environment setup.',
      },
      {
        serviceId: 'cuda',
        role: 'GPU runtime',
        action:
          'Verify CUDA is active with `nvidia-smi` and `nvcc --version`. All subsequent GPU workloads run on top of CUDA.',
      },
      {
        serviceId: 'ai-workbench',
        role: 'Dev environment manager',
        action:
          'Install NVIDIA AI Workbench (free) to manage GPU projects with Git and containers. Connect to your Brev instance and open projects in VS Code or JupyterLab.',
      },
    ],
  },
  {
    id: 'fine-tune-llm',
    goal: 'Fine-tune an LLM',
    description: 'Curate training data, fine-tune a model with NeMo, deploy via NIM.',
    difficulty: 'intermediate',
    steps: [
      {
        serviceId: 'brev',
        role: 'GPU provisioning',
        action:
          'Spin up a NeMo Launchable on Brev — a pre-configured GPU environment with NeMo and its dependencies.',
      },
      {
        serviceId: 'ngc',
        role: 'Model registry',
        action:
          'Download a base model checkpoint from NGC Catalog (e.g. Llama 3, Mistral). NGC containers are enterprise-supported with 36-month lifecycle.',
      },
      {
        serviceId: 'nemo-curator',
        role: 'Data preparation',
        action:
          'Use NeMo Curator to clean, filter, and prepare your domain-specific dataset. Format data into the structure NeMo expects for fine-tuning.',
      },
      {
        serviceId: 'nemo',
        role: 'Fine-tuning framework',
        action:
          'Run fine-tuning with NeMo using SFT, LoRA, or PEFT techniques. Monitor loss curves and save checkpoints at key intervals.',
      },
      {
        serviceId: 'nim',
        role: 'Deployment',
        action:
          'Package your fine-tuned model as a NIM microservice. NIM provides the optimized inference engine and standard API for your custom model.',
      },
    ],
  },
  {
    id: 'deploy-inference',
    goal: 'Deploy LLM inference at scale',
    description: 'Optimize, package, and serve LLM inference at production scale.',
    difficulty: 'intermediate',
    steps: [
      {
        serviceId: 'ngc',
        role: 'Container registry',
        action:
          'Pull the TensorRT-LLM container and your model from NGC Catalog. Containers are tested, versioned, and enterprise-supported.',
      },
      {
        serviceId: 'tensorrt-llm',
        role: 'LLM optimization',
        action:
          'Build an optimized engine with TensorRT-LLM. Apply quantization and kernel tuning to maximize throughput and reduce GPU memory footprint.',
      },
      {
        serviceId: 'nim',
        role: 'Packaged inference API',
        action:
          'Deploy the optimized model as a NIM microservice. NIM wraps TensorRT-LLM with a standard API, batching, and health endpoints.',
      },
      {
        serviceId: 'triton',
        role: 'Inference server',
        action:
          'Serve NIM or TensorRT models through Dynamo-Triton for production-scale deployment with dynamic batching and Kubernetes integration.',
      },
      {
        serviceId: 'ai-enterprise',
        role: 'Enterprise platform',
        action:
          'Deploy on NVIDIA AI Enterprise for production SLAs, 36-month support, and certified infrastructure for regulated industries.',
      },
    ],
  },
  {
    id: 'build-rag',
    goal: 'Build a RAG application',
    description: 'Set up retrieval-augmented generation with NeMo Retriever and safety rails.',
    difficulty: 'advanced',
    steps: [
      {
        serviceId: 'brev',
        role: 'GPU provisioning',
        action:
          'Provision a GPU instance on Brev with a RAG-focused Launchable including NeMo Retriever and NIM configurations.',
      },
      {
        serviceId: 'nemo-retriever',
        role: 'Document ingestion and retrieval',
        action:
          'Use NeMo Retriever to ingest documents, generate embeddings via NIM embedding microservices, and configure semantic search over your knowledge base.',
      },
      {
        serviceId: 'nim',
        role: 'LLM and embedding inference',
        action:
          'Run NIM microservices for the embedding model (document indexing and query encoding) and the LLM (answer generation from retrieved context).',
      },
      {
        serviceId: 'nemo-guardrails',
        role: 'Safety and compliance',
        action:
          'Wrap the RAG pipeline with NeMo Guardrails to define topic boundaries, prevent off-topic responses, and meet enterprise compliance requirements.',
      },
      {
        serviceId: 'triton',
        role: 'Production serving',
        action:
          'Deploy the RAG pipeline behind Dynamo-Triton for scalable concurrent serving with health monitoring and Kubernetes integration.',
      },
    ],
  },
  {
    id: 'build-agent',
    goal: 'Build an Agentic AI system',
    description: 'Develop, orchestrate, and deploy autonomous AI agents using NeMo and Nemotron.',
    difficulty: 'advanced',
    steps: [
      {
        serviceId: 'brev',
        role: 'GPU provisioning',
        action:
          'Launch a Brev Launchable configured for agentic AI development with NeMo Agent Toolkit and NIM pre-installed.',
      },
      {
        serviceId: 'nemo',
        role: 'Agent training framework',
        action:
          'Use NeMo to train or fine-tune the model that will power your agent. NeMo supports LLMs, multimodal, and speech — all valid agent backends.',
      },
      {
        serviceId: 'nemotron',
        role: 'Foundation model for reasoning',
        action:
          'Select a Nemotron model as your agent\'s reasoning core. Choose the tier (Nano / Super / Ultra) based on your accuracy vs. speed requirements.',
      },
      {
        serviceId: 'nemo-agent-toolkit',
        role: 'Agent orchestration and observability',
        action:
          'Instrument your agent pipeline with NeMo Agent Toolkit. Monitor cross-agent coordination, tool usage, and costs. Use the Agent Hyperparameter Optimizer to tune LLM parameters.',
      },
      {
        serviceId: 'nim',
        role: 'Model inference',
        action:
          'Deploy Nemotron or your fine-tuned model via NIM microservices. NIM provides the low-latency API your agent calls at inference time.',
      },
      {
        serviceId: 'blueprints',
        role: 'Reference architecture',
        action:
          'Use NVIDIA Blueprints as a reference for your specific agent use case (customer service, video analytics, cybersecurity). Customize the blueprint workflow for your domain.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// KEYWORD → WORKFLOW MATCHING
// ---------------------------------------------------------------------------

export const WORKFLOW_KEYWORDS: Record<string, string[]> = {
  'try-instantly':   ['try', 'test', 'demo', 'quick', 'api', 'model', 'explore', 'play'],
  'gpu-dev-env':     ['gpu', 'setup', 'environment', 'start', 'begin', 'dev', 'machine', 'configure'],
  'fine-tune-llm':   ['fine', 'tune', 'finetune', 'train', 'custom', 'llm', 'adapt', 'domain'],
  'deploy-inference':['deploy', 'inference', 'scale', 'production', 'serve', 'hosting', 'endpoint'],
  'build-rag':       ['rag', 'retrieval', 'search', 'knowledge', 'document', 'embedding', 'vector'],
  'build-agent':     ['agent', 'agentic', 'autonomous', 'copilot', 'multi', 'workflow', 'orchestrate', 'nemo agent'],
};

export function matchWorkflows(query: string, workflows: Workflow[]): Workflow[] {
  const q = query.toLowerCase().trim();
  if (!q) return workflows;
  return workflows.filter((wf) => {
    const keywords = WORKFLOW_KEYWORDS[wf.id] ?? [];
    return (
      keywords.some((k) => q.includes(k)) ||
      wf.goal.toLowerCase().includes(q) ||
      wf.description.toLowerCase().includes(q)
    );
  });
}
