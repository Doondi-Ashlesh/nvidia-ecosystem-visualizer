/**
 * POST /api/generate-flow
 *
 * Accepts { goal: string } and returns an AI-generated NVIDIA service path.
 *
 * Stack:
 *  • Model:      nvidia/llama-3.3-nemotron-super-49b-v1 via NVIDIA NIM API
 *  • Retrieval:  NeMo Retriever pattern — NVIDIA Embedding NIM (nv-embedqa-e5-v5)
 *                + cosine similarity to fetch top-K relevant skills for grounding
 *
 * NON-NEGOTIABLES enforced in the prompt (12 rules):
 *  1. Strict layer ordering: access → sdk → framework → agent → serving → enterprise
 *  2. If no concrete documented solution exists, return verified:false with suggested services
 *  3. Strictly grounded in NVIDIA official documentation — no invented connections
 *  4. AI must self-verify the path before returning it
 *  5. Explicit intra-layer dependency ordering
 *  6. Mandatory service inclusions per use-case
 *  7. Service exclusion rules
 *  8. Training / fine-tuning path rules (nemo-gym, model-optimizer, TensorRT-LLM, NIM)
 *  9. RAG pipeline rules (nemo-retriever + nim; no spurious NeMo training stack)
 * 10. Compliance / safety — nemo-guardrails when legal or policy requirements apply
 * 11. Evaluation / benchmarking — include nemo-evaluator when evaluation is required
 * 12. Inference engine compilation — include tensorrt-llm when compiling an optimized engine is required
 *
 * Requires NVIDIA_API_KEY in .env.local (optional GITHUB_TOKEN for skills refresh).
 * Optional NIM_REASONING — set to "true" to prefix the system prompt with "reasoning mode ON"
 * (Nemotron chain-of-thought). Omit or "false" for faster generation with no reasoning trace.
 */

import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { NVIDIA_SERVICES } from '@/data/nvidia';
import { retrieveRelevantSkills } from '@/lib/skills-retriever';
import type { Skill } from '@/types/ecosystem';

// Canonical layer order — enforced both in prompt and server-side sort
const LAYER_ORDER = ['access', 'sdk', 'framework', 'agent', 'serving', 'enterprise'];

// ── Intra-layer dependency pairs ──────────────────────────────────────────────
const INTRA_LAYER_ORDER: Array<[string, string]> = [
  ['nemo-curator', 'nemo'],
  ['nemo', 'nemo-guardrails'],
  ['nemo', 'nemo-retriever'],
  ['nemo', 'nemo-agent-toolkit'],
  ['nemo', 'nemo-evaluator'],
  ['nemo', 'nemo-gym'],
  ['tensorrt', 'tensorrt-llm'],
  ['model-optimizer', 'tensorrt-llm'],
  ['model-optimizer', 'nim'],
  ['tensorrt-llm', 'nim'],
  ['nemotron', 'nemo-agent-toolkit'],
];

// ── Mandatory co-inclusions ───────────────────────────────────────────────────
const MANDATORY_PAIRS: Array<{ if: string; thenInclude: string; reason: string }> = [
  {
    if: 'nemo-retriever',
    thenInclude: 'nim',
    reason: 'NeMo Retriever officially connects to NIM for embedding and LLM inference endpoints',
  },
  {
    if: 'nemo-guardrails',
    thenInclude: 'nim',
    reason: 'NeMo Guardrails wraps NIM/LLM deployments — NIM must be present',
  },
  {
    if: 'tensorrt-llm',
    thenInclude: 'nim',
    reason: 'TensorRT-LLM powers NIM microservice containers — NIM is the deployment target',
  },
  {
    if: 'blueprints',
    thenInclude: 'nim',
    reason: 'NVIDIA Blueprints combine NIM microservices as the inference layer',
  },
  {
    if: 'nemo-curator',
    thenInclude: 'nemo',
    reason: 'NeMo Curator prepares data for NeMo training — both must appear, with curator first',
  },
  {
    if: 'nemo-gym',
    thenInclude: 'nemo',
    reason: 'NeMo Gym RL training environments require NeMo framework as the base training infrastructure',
  },
];

// ── Service use-case exclusions ───────────────────────────────────────────────
const SERVICE_EXCLUSIONS: Array<{ id: string; notFor: string[]; reason: string }> = [
  {
    id: 'tensorrt',
    notFor: [
      'rag', 'retrieval', 'agent', 'agentic', 'chatbot', 'document', 'knowledge base',
      'fine-tune', 'fine-tuning', 'finetune', 'train', 'training', 'pre-train', 'pre-training',
      'multimodal', 'multi-modal', 'customize', 'customise',
    ],
    reason:
      'TensorRT optimises already-trained neural networks for inference (CNNs, LLMs, diffusion). ' +
      'It is NOT used during training, fine-tuning, RAG pipelines, or agentic systems. ' +
      'Only include TensorRT when the goal explicitly asks to speed up or optimise inference.',
  },
  {
    id: 'tensorrt-llm',
    notFor: ['rag', 'retrieval', 'agent', 'agentic'],
    reason:
      'TensorRT-LLM is for LLM inference optimisation and powers NIM. ' +
      'Do not include it for pure RAG/agent goals unless the goal explicitly calls for inference optimisation.',
  },
  {
    id: 'rapids',
    notFor: ['rag', 'llm', 'agent', 'fine-tune', 'serving'],
    reason:
      'RAPIDS is for GPU-accelerated data science (tabular data, graph analytics, vector search). ' +
      'Do not include it in LLM, RAG, or agent workflows.',
  },
  {
    id: 'nemo-curator',
    notFor: ['rag', 'rag pipeline', 'retrieval augmented', 'inference-only', 'agent', 'serving-only'],
    reason:
      'NeMo Curator is for data curation before LLM pre-training or fine-tuning. ' +
      'It has NO role in RAG pipelines — RAG retrieves from existing knowledge, it does not train models.',
  },
  {
    id: 'nemo',
    notFor: ['rag pipeline', 'rag chatbot', 'retrieval augmented generation', 'build a rag', 'rag over'],
    reason:
      'NeMo is a training/fine-tuning framework. ' +
      'A RAG pipeline does NOT train a model — it embeds documents and retrieves at inference time. ' +
      'Only include NeMo if the goal explicitly involves fine-tuning a model as part of the RAG setup.',
  },
  {
    id: 'model-optimizer',
    notFor: ['rag', 'retrieval', 'agent', 'agentic', 'chatbot'],
    reason:
      'NVIDIA Model Optimizer compresses/quantizes already-trained models for inference. ' +
      'It is NOT used in RAG pipelines, agent orchestration, or data collection workflows.',
  },
  {
    id: 'megatron-lm',
    notFor: ['rag', 'retrieval', 'inference', 'deployment', 'serving', 'agent'],
    reason:
      'Megatron-LM is a large-scale pre-training framework for foundation models. ' +
      'It is NOT for inference, RAG pipelines, or agent orchestration.',
  },
  {
    id: 'nemo-evaluator',
    notFor: ['inference-only', 'serving-only'],
    reason:
      'NeMo Evaluator is for LLM evaluation and benchmarking (post-training). ' +
      'It does not serve production inference or build RAG/agent pipelines.',
  },
  {
    id: 'nemo-gym',
    notFor: ['inference', 'deployment', 'serving', 'rag', 'retrieval', 'chatbot'],
    reason:
      'NeMo Gym provides RL training environments for RLHF/RLAIF alignment. ' +
      'It is NOT for inference serving, RAG, or deployment workflows.',
  },
  {
    id: 'cuopt',
    notFor: [
      'llm', 'rag', 'retrieval', 'agent', 'fine-tune', 'fine-tuning',
      'serving', 'inference', 'language model', 'train',
    ],
    reason:
      'NVIDIA cuOpt is for combinatorial optimization (vehicle routing, logistics, LP/MILP/QP). ' +
      'It is a completely separate domain from LLM workflows.',
  },
];

// ── Skills prompt section builder ─────────────────────────────────────────────

function buildSkillsPromptSection(skills: Skill[]): string {
  if (!skills.length) return '';
  const lines = skills.map(s => `  • ${s.name}: ${s.description}`);
  return [
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'RETRIEVED AGENT SKILLS (semantically matched to this goal via NeMo Retriever)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Reference these officially documented capabilities in your step actions:',
    ...lines,
  ].join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip optional inline thinking blocks from model content (NIM usually uses reasoning_content instead). */
function splitThinking(raw: string): { reasoning: string; answer: string } {
  const stripped = raw.trim();
  const patterns: RegExp[] = [
    /<redacted_thinking>([\s\S]*?)<\/think>/i,
    /<redacted_thinking>([\s\S]*?)<\/redacted_thinking>/i,
  ];
  for (const re of patterns) {
    const m = stripped.match(re);
    if (m) {
      const reasoning = (m[1] ?? '').trim();
      const answer = stripped.replace(re, '').trim();
      return { reasoning, answer };
    }
  }
  return { reasoning: '', answer: stripped };
}

/** Strip markdown code fences so JSON.parse doesn't choke */
function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text.trim();
}

// ── Core generation function (supports one retry) ─────────────────────────────

async function runGeneration(
  goal: string,
  nim: OpenAI,
  serviceList: string,
  skillsSection: string,
  layerOrderStr: string,
  intraLayerRules: string,
  mandatoryRules: string,
  exclusionRules: string,
  reasoningEnabled: boolean,
) {
  // When enabled, "reasoning mode ON" must be the first line (per NVIDIA NIM Nemotron docs).
  const reasoningPrefix = reasoningEnabled ? 'reasoning mode ON\n\n' : '';

  const systemPrompt = `${reasoningPrefix}You are a senior NVIDIA AI solutions architect with deep knowledge of NVIDIA's official product documentation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NON-NEGOTIABLE RULES (never violate)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE 1 — CROSS-LAYER ORDER IS MANDATORY
  Steps must follow this exact left-to-right order: ${layerOrderStr}
  A service from a later layer CANNOT appear before a service from an earlier layer.
  Skipping a layer is allowed. Reversing is NOT.
  FORBIDDEN example: enterprise → access → serving
  ALLOWED example:   access → framework → serving → enterprise

RULE 2 — INTRA-LAYER DEPENDENCY ORDER
  When multiple services from the same layer appear, their order within that layer matters:
${intraLayerRules}

RULE 3 — MANDATORY CO-INCLUSIONS
  Certain services require other services to be present in the path:
${mandatoryRules}

RULE 4 — SERVICE EXCLUSIONS BY USE-CASE
  Certain services must never appear in paths for specific types of goals:
${exclusionRules}

RULE 5 — CANNOT VERIFY → SUGGEST SERVICES
  If the goal cannot be addressed with documented NVIDIA workflows, do NOT fabricate a path.
  Set verified:false, explain why in 1-2 sentences, and list 1-4 serviceIds to investigate.

RULE 6 — STRICTLY OFFICIAL DOCUMENTATION
  Every step must be grounded in NVIDIA's official documentation for that service.
  Do not invent capabilities, connections, or use-cases that are not officially documented.

RULE 7 — TRAINING AND FINE-TUNING PATHS
  If the goal involves fine-tuning, customising, or training a model on custom/own data:
    • MUST include "nemo-curator" BEFORE "nemo" — data is always curated before training.
    • For RL alignment: include "nemo-gym" AFTER "nemo" — RL alignment follows supervised fine-tuning.
    • For post-training optimization: include "model-optimizer" — compresses/quantizes the trained model before serving.
    • "tensorrt-llm" compiles the optimized model into an inference engine — always after model-optimizer when both present.
    • "nim" is the final deployment target — always last in the serving layer.
    • Correct full fine-tune order: [access] → nemo-curator → nemo → [nemo-gym] → [model-optimizer] → tensorrt-llm → nim

RULE 8 — RAG PIPELINES (retrieval-augmented generation)
  RAG is an INFERENCE-TIME pattern — it retrieves relevant documents at query time and injects them
  into the LLM prompt. It does NOT train or fine-tune a model.
  For any RAG goal:
    • MUST include "nemo-retriever" — it is the ONLY NVIDIA service for document embedding and retrieval.
    • MUST include "nim" — it serves the LLM that generates the response.
    • MUST NOT include "nemo-curator" — data curation is for training, not retrieval.
    • MUST NOT include "nemo" — NeMo is a training framework; RAG does not train models.
      (Exception: only include nemo if the goal explicitly asks to also fine-tune the LLM.)
    • Correct minimal RAG path: [ngc] → nemo-retriever → [nemo-guardrails] → nim

RULE 9 — COMPLIANCE AND SAFETY REQUIREMENTS
  If the goal mentions ANY of: legal review, compliance, regulatory, governance, safety policies,
  privacy requirements, audit, enterprise policy, or content moderation:
    • MUST include "nemo-guardrails" in the path — it is the ONLY NVIDIA service for enforcing
      LLM safety policies, legal constraints, topic restrictions, and compliance guardrails.
    • Place "nemo-guardrails" in the framework layer, AFTER "nemo" if fine-tuning is involved.
    • This is non-negotiable — omitting guardrails when compliance is stated is an incorrect path.

RULE 10 — EVALUATION / BENCHMARKING REQUIREMENTS
  If the goal mentions ANY of: evaluate, evaluation, evaluator, benchmark, benchmarking, accuracy,
  held-out set, test set, NEL, or metrics:
    • MUST include "nemo-evaluator" in the path — use it to run structured evaluation jobs and
      produce metrics before deployment decisions.

RULE 11 — INFERENCE ENGINE COMPILATION REQUIREMENTS
  If the goal mentions ANY of: compile, compilation, build an engine, inference engine, TensorRT,
  TRT, max throughput, throughput, low latency, or optimize inference:
    • MUST include "tensorrt-llm" in the path — compile an optimized inference engine for high-throughput serving.

RULE 12 — SELF-VERIFICATION CHECKLIST
  Before returning your answer, verify ALL of the following:
    (a) Every serviceId is a real id from the AVAILABLE SERVICES list below ✓
    (b) Cross-layer order strictly follows: ${layerOrderStr} ✓
    (c) Intra-layer dependency order is respected (Rule 2) ✓
    (d) All mandatory co-inclusions are satisfied (Rule 3) ✓
    (e) No excluded services appear for this goal type (Rule 4) ✓
    (f) Training goals include nemo-curator and respect Rule 7 ✓
    (g) RAG goals use nemo-retriever + nim and do NOT include nemo or nemo-curator (Rule 8) ✓
    (h) Compliance/legal goals include nemo-guardrails (Rule 9) ✓
    (i) Evaluation/benchmark goals include nemo-evaluator (Rule 10) ✓
    (j) Engine compilation goals include tensorrt-llm (Rule 11) ✓
    (h) Every action is grounded in official NVIDIA documentation ✓
    (i) The complete path genuinely solves the stated goal ✓
  Only set verified:true if every single check passes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVAILABLE SERVICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${serviceList}
${skillsSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — respond with valid JSON only, no prose outside the JSON block
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When path is valid (verified:true):
{
  "verified": true,
  "steps": [
    {
      "serviceId": "<exact id from list>",
      "role": "<3-6 word role label>",
      "action": "<1-2 sentence instruction grounded in official docs>",
      "inputs": ["<artifact or data this step receives>"],
      "outputs": ["<artifact or data this step produces>"]
    }
  ]
}

When path cannot be verified (verified:false):
{
  "verified": false,
  "message": "<clear 1-2 sentence explanation>",
  "suggestedServices": ["<id1>", "<id2>"]
}`;

  const completion = await nim.chat.completions.create({
    model:       'nvidia/llama-3.3-nemotron-super-49b-v1',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: goal },
    ],
    temperature: 0.6,
    top_p:       0.95,
    max_tokens:  4096,
  });

  const msg = completion.choices[0]?.message as unknown as Record<string, unknown>;
  // NIM returns reasoning in `reasoning_content` (separate field, not <think> tags)
  const reasoningContent = (msg?.reasoning_content ?? '') as string;
  const rawContent = (msg?.content ?? '{}') as string;
  // Try <think> tags first (fallback), use reasoning_content field when present
  const { reasoning: thinkReasoning, answer } = splitThinking(rawContent);
  const reasoning = thinkReasoning || reasoningContent;
  return { raw: stripFences(answer), reasoning };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const { goal } = (await request.json()) as { goal: string };

  if (!goal?.trim()) {
    return NextResponse.json({ error: 'Goal is required' }, { status: 400 });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'NVIDIA_API_KEY not set in environment' },
      { status: 500 },
    );
  }

  const nim = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
  });

  // ── Retrieve semantically relevant skills (NeMo Retriever pattern) ──────
  let relevantSkills: Skill[] = [];
  try {
    relevantSkills = await retrieveRelevantSkills(goal, 5);
  } catch (err) {
    // Non-fatal — generation proceeds without skills grounding
    console.warn('[generate-flow] Skills retrieval failed, proceeding without:', err);
  }

  const skillsSection = buildSkillsPromptSection(relevantSkills);

  // ── Build prompt components ──────────────────────────────────────────────
  const serviceList = NVIDIA_SERVICES.map(
    (s) =>
      `  id:"${s.id}" | layer:${s.layer} | ${s.name}\n` +
      `    desc: ${s.skills?.length ? s.shortDescription : s.fullDescription}\n` +
      `    docs: ${s.officialUrl}`,
  ).join('\n');

  const layerOrderStr = LAYER_ORDER.join(' → ');

  const intraLayerRules = INTRA_LAYER_ORDER.map(
    ([a, b]) => `  • If both "${a}" and "${b}" are in the path → "${a}" MUST appear before "${b}"`,
  ).join('\n');

  const mandatoryRules = MANDATORY_PAIRS.map(
    (p) => `  • If "${p.if}" is in the path → you MUST also include "${p.thenInclude}" (reason: ${p.reason})`,
  ).join('\n');

  const exclusionRules = SERVICE_EXCLUSIONS.map(
    (e) =>
      `  • "${e.id}" must NOT appear in paths for goals involving: ${e.notFor.join(', ')}\n` +
      `    Reason: ${e.reason}`,
  ).join('\n');

  const reasoningEnabled =
    process.env.NIM_REASONING === 'true' || process.env.NIM_REASONING === '1';

  const generationArgs = [
    goal,
    nim,
    serviceList,
    skillsSection,
    layerOrderStr,
    intraLayerRules,
    mandatoryRules,
    exclusionRules,
    reasoningEnabled,
  ] as const;

  try {
    const t0 = Date.now();

    type ParsedResponse = {
      verified?:          boolean;
      steps?:             Array<{ serviceId: string; role: string; action: string; inputs?: string[]; outputs?: string[] }>;
      message?:           string;
      suggestedServices?: string[];
    };

    let result   = await runGeneration(...generationArgs);
    let reasoning = result.reasoning;
    let parsed   = JSON.parse(result.raw) as ParsedResponse;

    const validIds     = new Set(NVIDIA_SERVICES.map((s) => s.id));
    const serviceById  = new Map(NVIDIA_SERVICES.map((s) => [s.id, s]));

    // ── Unverified / no-path ──────────────────────────────────────────────
    if (parsed.verified === false) {
      const suggested = (parsed.suggestedServices ?? [])
        .filter((id) => validIds.has(id))
        .map((id) => {
          const svc = serviceById.get(id)!;
          return { id: svc.id, name: svc.name, officialUrl: svc.officialUrl };
        });

      return NextResponse.json(
        {
          verified:          false,
          message:           parsed.message ?? 'No documented NVIDIA path found for this goal.',
          suggestedServices: suggested,
        },
        { status: 422 },
      );
    }

    // ── Valid path — server-side safety net ──────────────────────────────
    let steps = (parsed.steps ?? []).filter((s) => validIds.has(s.serviceId));

    // Retry once if model returned no valid steps
    if (steps.length === 0) {
      console.warn('[generate-flow] No valid steps in first attempt — retrying once');
      result    = await runGeneration(...generationArgs);
      reasoning = result.reasoning || reasoning;
      const retried = JSON.parse(result.raw) as ParsedResponse;
      steps = (retried.steps ?? []).filter((s) => validIds.has(s.serviceId));
    }

    if (steps.length === 0) {
      return NextResponse.json(
        {
          verified:          false,
          message:           'Could not map your goal to any documented NVIDIA services. Try being more specific.',
          suggestedServices: [],
        },
        { status: 422 },
      );
    }

    // 0. Enforce service exclusions — strip any services the model included against the rules
    const goalWords = goal.toLowerCase();
    steps = steps.filter((s) => {
      const rule = SERVICE_EXCLUSIONS.find((r) => r.id === s.serviceId);
      if (!rule) return true;
      const violated = rule.notFor.some((kw) => goalWords.includes(kw));
      if (violated) console.warn(`[generate-flow] Stripped excluded service "${s.serviceId}" for goal keywords`);
      return !violated;
    });

    // 1. Enforce cross-layer order
    steps = [...steps].sort((a, b) => {
      const layerA = serviceById.get(a.serviceId)?.layer ?? '';
      const layerB = serviceById.get(b.serviceId)?.layer ?? '';
      return LAYER_ORDER.indexOf(layerA) - LAYER_ORDER.indexOf(layerB);
    });

    // 2. Enforce intra-layer dependency order
    const stepIds = steps.map((s) => s.serviceId);
    for (const [before, after] of INTRA_LAYER_ORDER) {
      const bi = stepIds.indexOf(before);
      const ai = stepIds.indexOf(after);
      if (bi !== -1 && ai !== -1 && bi > ai) {
        [steps[bi], steps[ai]] = [steps[ai], steps[bi]];
        stepIds[bi] = steps[bi].serviceId;
        stepIds[ai] = steps[ai].serviceId;
      }
    }

    // 3. Inject any missing mandatory co-inclusions
    for (const rule of MANDATORY_PAIRS) {
      const hasIf   = steps.some((s) => s.serviceId === rule.if);
      const hasThen = steps.some((s) => s.serviceId === rule.thenInclude);
      if (hasIf && !hasThen) {
        const svc = serviceById.get(rule.thenInclude);
        if (svc) {
          steps.push({
            serviceId: svc.id,
            role:      `Required — ${svc.name}`,
            action:    `${rule.reason}. Add ${svc.name} to complete the path.`,
          });
        }
      }
    }

    // 4. Enforce compliance rule (Rule 9): inject nemo-guardrails when goal mentions legal/compliance
    const complianceKeywords = [
      'legal', 'compliance', 'compliant', 'regulatory', 'regulation', 'governance',
      'safety policy', 'safety policies', 'audit', 'privacy', 'content moderation',
      'enterprise policy', 'review before', 'review prior',
    ];
    const goalLower = goal.toLowerCase();
    const isComplianceGoal = complianceKeywords.some((kw) => goalLower.includes(kw));
    const hasGuardrails = steps.some((s) => s.serviceId === 'nemo-guardrails');
    if (isComplianceGoal && !hasGuardrails) {
      const svc = serviceById.get('nemo-guardrails');
      if (svc) {
        steps.push({
          serviceId: 'nemo-guardrails',
          role:      'Compliance & Safety Guardrails',
          action:    'Apply NeMo Guardrails to enforce legal review policies, content restrictions, and safety constraints before deployment.',
          inputs:    [],
          outputs:   [],
        });
      }
    }

    // 5. Enforce evaluation rule (Rule 10): inject nemo-evaluator when goal mentions evaluation/benchmarks
    const evaluationKeywords = [
      'evaluate', 'evaluation', 'evaluator',
      'benchmark', 'benchmarks', 'benchmarking',
      'accuracy', 'metrics',
      'held-out', 'holdout', 'test set', 'validation set',
      'nel', 'mlflow',
    ];
    const isEvaluationGoal = evaluationKeywords.some((kw) => goalLower.includes(kw));
    const hasEvaluator = steps.some((s) => s.serviceId === 'nemo-evaluator');
    if (isEvaluationGoal && !hasEvaluator) {
      const svc = serviceById.get('nemo-evaluator');
      if (svc) {
        steps.push({
          serviceId: 'nemo-evaluator',
          role:      'Evaluation & Benchmarking',
          action:    'Run structured evaluation jobs and capture metrics on a held-out set to validate quality and safety before deployment decisions.',
          inputs:    [],
          outputs:   [],
        });
      }
    }

    // 6. Enforce engine compilation rule (Rule 11): inject tensorrt-llm when goal implies engine compilation/perf serving
    const engineKeywords = [
      'compile', 'compilation', 'build an engine', 'inference engine',
      'tensorrt', 'trt', 'trt-llm',
      'throughput', 'max throughput', 'low latency', 'optimize inference',
    ];
    const isEngineGoal = engineKeywords.some((kw) => goalLower.includes(kw));
    const hasTrtLlm = steps.some((s) => s.serviceId === 'tensorrt-llm');
    if (isEngineGoal && !hasTrtLlm) {
      const svc = serviceById.get('tensorrt-llm');
      if (svc) {
        steps.push({
          serviceId: 'tensorrt-llm',
          role:      'Compile Inference Engine',
          action:    'Compile an optimized LLM inference engine for high-throughput, low-latency serving as the deployment target.',
          inputs:    [],
          outputs:   [],
        });
      }
    }

    // Re-sort after injections
    steps = steps.sort((a, b) => {
      const layerA = serviceById.get(a.serviceId)?.layer ?? '';
      const layerB = serviceById.get(b.serviceId)?.layer ?? '';
      return LAYER_ORDER.indexOf(layerA) - LAYER_ORDER.indexOf(layerB);
    });

    const latencyMs = Date.now() - t0;

    return NextResponse.json({
      verified:         true,
      goal,
      steps,
      latencyMs,
      reasoning:        reasoning || null,
      reasoningEnabled,
    });
  } catch (err: unknown) {
    console.error('[generate-flow] NVIDIA NIM error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('too many');
    return NextResponse.json(
      { error: isRateLimit
          ? 'NIM rate limit hit — wait a few seconds and try again'
          : 'AI generation failed — check NVIDIA_API_KEY' },
      { status: 500 },
    );
  }
}
