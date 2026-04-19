/**
 * lib/validators/path.ts
 *
 * Validates a Stage 2 service path against the GoalSpec it's meant to
 * implement. Catches three classes of planner failure we observed:
 *
 *   1. LLM-only services selected for non-LLM use cases (e.g. NeMo Guardrails
 *      on a tabular fraud classifier, or NeMo Evaluator on a speech model).
 *   2. Broken layer ordering (serving listed before framework, which implies
 *      "deploy before training" — impossible).
 *   3. Inputs/outputs that don't chain — a step references inputs that no
 *      earlier step produced.
 *
 * WHY: Stage 2's prompt is good, but the 120B pattern-matches "compliance →
 * Guardrails" and "evaluation → NeMo Evaluator" regardless of the actual
 * model type. A post-gen validator catches this deterministically and feeds
 * a specific re-prompt back to the model.
 *
 * Procedures: docs/procedures/02-validator.md
 */

import type { GoalSpec, WorkflowStep, Layer } from '@/types/ecosystem';
import { NVIDIA_SERVICES } from '@/data/nvidia';

// ──────────────────────────────────────────────────────────────────────
// Static lookup maps (built once from catalog)
// ──────────────────────────────────────────────────────────────────────

const SERVICE_BY_ID = new Map(NVIDIA_SERVICES.map((s) => [s.id, s]));

const LAYER_ORDER: Layer[] = [
  'access',
  'sdk',
  'framework',
  'agent',
  'serving',
  'enterprise',
];
const LAYER_INDEX: Record<Layer, number> = Object.fromEntries(
  LAYER_ORDER.map((l, i) => [l, i]),
) as Record<Layer, number>;

/**
 * Services that only make sense when the path produces LLM / generative /
 * chatbot output. Putting them on a tabular classifier, CV model, or ASR
 * pipeline is a planner misfit.
 */
const LLM_ONLY_SERVICES = new Set([
  'nemo-guardrails', // prompt / output safety for LLMs
  'nemo-evaluator',  // MMLU / HellaSwag / hallucination benchmarks
  'nemo-retriever',  // RAG embedding retriever
  'tensorrt-llm',    // LLM-specific inference engine
  'megatron-lm',     // LLM pretraining
  'nemo-gym',        // RLHF environment
]);

/**
 * `nemotron` is the NVIDIA LLM family — add to LLM-only *unless* the use case
 * actually is language generation. Handled as a soft signal because Nemotron
 * occasionally shows up as a general-purpose "pretrained backbone" suggestion.
 */
const LLM_FAMILY_SERVICES = new Set(['nemotron']);

// ──────────────────────────────────────────────────────────────────────
// LLM-use-case heuristic
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide whether the GoalSpec describes an LLM / generative / chatbot use
 * case. We stay on the conservative side: only flag LLM-only services when
 * we have strong signal this is NOT an LLM project.
 *
 * Keywords are matched against domain + use_case_type + summary combined.
 */
export function isLLMUseCase(goalSpec: GoalSpec): boolean {
  const haystack = [
    goalSpec.domain,
    goalSpec.use_case_type,
    goalSpec.summary,
    ...goalSpec.inferred_requirements.map((r) => r.requirement),
  ]
    .join(' ')
    .toLowerCase();

  const LLM_SIGNALS = [
    'llm',
    'language model',
    'chatbot',
    'chat bot',
    'conversational',
    'rag',
    'retrieval-augmented',
    'generative ai',
    'text generation',
    'summarization',
    'question answering',
    'instruction following',
    'nemotron',
    'llama',
    'mistral',
    'prompt',
  ];
  return LLM_SIGNALS.some((kw) => haystack.includes(kw));
}

const NON_LLM_SIGNALS = [
  'tabular',
  'fraud detection',
  'anomaly detection',
  'recommendation',
  'recommender',
  'image classification',
  'object detection',
  'segmentation',
  'speech recognition',
  'asr',
  'transcription',
  'time series',
  'forecasting',
  'churn',
  'predictive maintenance',
];

export function hasStrongNonLLMSignal(goalSpec: GoalSpec): boolean {
  const haystack = [
    goalSpec.domain,
    goalSpec.use_case_type,
    goalSpec.summary,
  ]
    .join(' ')
    .toLowerCase();
  return NON_LLM_SIGNALS.some((kw) => haystack.includes(kw));
}

// ──────────────────────────────────────────────────────────────────────
// Validator
// ──────────────────────────────────────────────────────────────────────

export interface PathViolation {
  code:
    | 'llm_service_in_non_llm_path'
    | 'broken_layer_order'
    | 'unknown_service_id'
    | 'disconnected_data_flow'
    | 'duplicate_service'
    | 'empty_path';
  serviceId?: string;
  stepIndex?: number;
  message: string;
  /** Concrete instruction to paste into a re-prompt. */
  reprompt: string;
}

export interface PathValidationResult {
  /** True when no violations were found. */
  ok: boolean;
  /** Human-readable violation messages (duplicates `violations[].message`). */
  errors: string[];
  violations: PathViolation[];
  /** For quick categorisation in logs / tests. */
  kind: 'clean' | 'soft' | 'hard';
}

/**
 * Run the full Stage-2 validator. Violations are categorised as:
 *   - hard:  the path is structurally broken (empty, unknown service, bad layer order)
 *   - soft:  the path is viable but has misfits (LLM service in non-LLM path, disconnected data flow)
 *   - clean: no issues
 *
 * Callers decide whether to re-prompt on soft violations. Hard violations
 * should always re-prompt.
 */
export function validatePath(
  steps: WorkflowStep[],
  goalSpec: GoalSpec,
): PathValidationResult {
  const violations: PathViolation[] = [];

  // ── Empty / trivial path ──────────────────────────────────────────
  if (!steps || steps.length === 0) {
    violations.push({
      code: 'empty_path',
      message: 'Path has no steps.',
      reprompt: 'You returned zero steps. Emit at least 4 steps covering data, model, serving, and enterprise.',
    });
    return { ok: false, errors: [violations[0].message], violations, kind: 'hard' };
  }

  // ── Unknown service IDs ───────────────────────────────────────────
  for (let i = 0; i < steps.length; i++) {
    const id = steps[i].serviceId;
    if (!SERVICE_BY_ID.has(id)) {
      violations.push({
        code: 'unknown_service_id',
        serviceId: id,
        stepIndex: i,
        message: `Step ${i + 1} references unknown service id "${id}".`,
        reprompt: `Service id "${id}" does not exist in the NVIDIA catalog. Replace it with a real service id from the provided list, or drop the step.`,
      });
    }
  }

  // ── Duplicate services ────────────────────────────────────────────
  const seen = new Map<string, number>();
  for (let i = 0; i < steps.length; i++) {
    const id = steps[i].serviceId;
    if (seen.has(id)) {
      violations.push({
        code: 'duplicate_service',
        serviceId: id,
        stepIndex: i,
        message: `Step ${i + 1} duplicates service "${id}" (first appears at step ${seen.get(id)! + 1}).`,
        reprompt: `Service "${id}" appears more than once. Emit each service at most once and merge the roles.`,
      });
    } else {
      seen.set(id, i);
    }
  }

  // ── Layer ordering ────────────────────────────────────────────────
  let lastLayerIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    const svc = SERVICE_BY_ID.get(steps[i].serviceId);
    if (!svc) continue; // already flagged as unknown
    const idx = LAYER_INDEX[svc.layer];
    if (idx < lastLayerIdx) {
      violations.push({
        code: 'broken_layer_order',
        serviceId: steps[i].serviceId,
        stepIndex: i,
        message: `Step ${i + 1} (${steps[i].serviceId}, layer=${svc.layer}) appears after a later-layer step. Layer order must be ${LAYER_ORDER.join(' → ')}.`,
        reprompt: `Layer order is wrong: step ${i + 1} uses "${steps[i].serviceId}" (${svc.layer}) after a step from a later layer. Re-emit the path in strict layer order: ${LAYER_ORDER.join(' → ')}.`,
      });
    } else {
      lastLayerIdx = idx;
    }
  }

  // ── LLM-only services in non-LLM path ────────────────────────────
  const isLLM = isLLMUseCase(goalSpec);
  const strongNonLLM = hasStrongNonLLMSignal(goalSpec);
  if (!isLLM && strongNonLLM) {
    for (let i = 0; i < steps.length; i++) {
      const id = steps[i].serviceId;
      if (LLM_ONLY_SERVICES.has(id) || LLM_FAMILY_SERVICES.has(id)) {
        violations.push({
          code: 'llm_service_in_non_llm_path',
          serviceId: id,
          stepIndex: i,
          message: `Step ${i + 1} uses LLM-only service "${id}" in a non-LLM use case ("${goalSpec.use_case_type}").`,
          reprompt: `Service "${id}" is for LLM / generative-AI pipelines only. This project is "${goalSpec.use_case_type}" which is not LLM-based, so remove "${id}" from the path. Pick a service that fits tabular / classification / regression / speech / vision workloads instead.`,
        });
      }
    }
  }

  // ── Data-flow chaining ───────────────────────────────────────────
  // Each step's declared `inputs` should either be domain-level primitives
  // (user query, raw data, model weights) OR should appear in some earlier
  // step's `outputs`. Pure heuristic — we only flag when a step declares
  // inputs AND no earlier step has outputs at all.
  const produced: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const inputs = step.inputs ?? [];
    const outputs = step.outputs ?? [];
    if (i > 0 && inputs.length > 0 && produced.length === 0) {
      // Earlier steps produced nothing but this one demands inputs.
      violations.push({
        code: 'disconnected_data_flow',
        serviceId: step.serviceId,
        stepIndex: i,
        message: `Step ${i + 1} declares inputs but no earlier step produces outputs.`,
        reprompt: `Step ${i + 1} ("${step.serviceId}") has inputs but earlier steps declare no outputs. Every step that consumes data must have an upstream step producing it. Add the missing producer step or remove the consumer.`,
      });
    }
    produced.push(...outputs);
  }

  const hard = violations.some(
    (v) =>
      v.code === 'empty_path' ||
      v.code === 'unknown_service_id' ||
      v.code === 'broken_layer_order' ||
      v.code === 'duplicate_service',
  );
  const soft = violations.some(
    (v) =>
      v.code === 'llm_service_in_non_llm_path' ||
      v.code === 'disconnected_data_flow',
  );

  if (violations.length === 0) {
    return { ok: true, errors: [], violations: [], kind: 'clean' };
  }
  return {
    ok: false,
    errors: violations.map((v) => v.message),
    violations,
    kind: hard ? 'hard' : soft ? 'soft' : 'soft',
  };
}

/**
 * Concatenated re-prompt string to append to the model when we ask it to
 * fix the path. Short and directive — long feedback makes Nemotron drift.
 */
export function buildPathRepromptFeedback(
  result: PathValidationResult,
): string {
  if (result.ok) return '';
  const lines = result.violations.map((v) => `- ${v.reprompt}`);
  return [
    'Your previous path had issues. Fix every one of them and emit a new JSON object:',
    ...lines,
  ].join('\n');
}
