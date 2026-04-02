/**
 * POST /api/generate-flow
 *
 * Accepts { goal: string } and returns an AI-generated NVIDIA service path.
 *
 * NON-NEGOTIABLES enforced in the prompt:
 *  1. Strict layer ordering: access → sdk → framework → agent → serving → enterprise
 *  2. If no concrete documented solution exists, return verified:false with suggested services
 *  3. Strictly grounded in NVIDIA official documentation — no invented connections
 *  4. AI must self-verify the path before returning it
 *  5. Explicit intra-layer dependency ordering (e.g. nemo before nemo-retriever)
 *  6. Mandatory service inclusions per use-case (e.g. NIM required for RAG)
 *  7. Service exclusion rules (e.g. TensorRT only for inference optimisation, not RAG/agents)
 *
 * Requires GROQ_API_KEY in .env.local
 */

import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { NVIDIA_SERVICES } from '@/data/nvidia';

// Canonical layer order — enforced both in prompt and server-side sort
const LAYER_ORDER = ['access', 'sdk', 'framework', 'agent', 'serving', 'enterprise'];

// ── Intra-layer dependency pairs ──────────────────────────────────────────────
// When BOTH services appear in a path, the left one MUST come first.
const INTRA_LAYER_ORDER: Array<[string, string]> = [
  // NeMo is the parent framework — all NeMo microservices depend on it
  ['nemo', 'nemo-curator'],
  ['nemo', 'nemo-guardrails'],
  ['nemo', 'nemo-retriever'],
  ['nemo', 'nemo-agent-toolkit'],
  // TensorRT core before TensorRT-LLM (LLM is a component of TensorRT)
  ['tensorrt', 'tensorrt-llm'],
  // Nemotron (model) before NeMo Agent Toolkit (orchestration)
  ['nemotron', 'nemo-agent-toolkit'],
];

// ── Mandatory co-inclusions ───────────────────────────────────────────────────
// If service A is in the path, service B MUST also be included.
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
];

// ── Service use-case exclusions ───────────────────────────────────────────────
// Describes when a service should NOT be included, to prevent hallucinated steps.
const SERVICE_EXCLUSIONS: Array<{ id: string; notFor: string[]; reason: string }> = [
  {
    id: 'tensorrt',
    notFor: ['rag', 'retrieval', 'agent', 'agentic', 'chatbot', 'document', 'knowledge base'],
    reason:
      'TensorRT is for optimising neural network inference (CNNs, LLMs, diffusion). ' +
      'It is NOT a component of RAG pipelines or agentic systems.',
  },
  {
    id: 'tensorrt-llm',
    notFor: ['rag', 'retrieval', 'agent', 'agentic'],
    reason:
      'TensorRT-LLM is for LLM inference optimisation and powers NIM. ' +
      'Include it only when the goal explicitly involves LLM inference optimisation.',
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
    notFor: ['rag', 'inference', 'deployment', 'agent', 'serving'],
    reason:
      'NeMo Curator is for data curation before LLM pre-training or fine-tuning. ' +
      'It has no role in RAG, inference, or agent deployment workflows.',
  },
];

export async function POST(request: Request) {
  const { goal } = (await request.json()) as { goal: string };

  if (!goal?.trim()) {
    return NextResponse.json({ error: 'Goal is required' }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY not set in environment' },
      { status: 500 },
    );
  }

  const groq = new Groq({ apiKey });

  const serviceList = NVIDIA_SERVICES.map(
    (s) =>
      `  id:"${s.id}" | layer:${s.layer} | ${s.name}\n` +
      `    desc: ${s.shortDescription}\n` +
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

  const systemPrompt = `You are a senior NVIDIA AI solutions architect with deep knowledge of NVIDIA's official product documentation.

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

RULE 7 — SELF-VERIFICATION CHECKLIST
  Before returning your answer, verify ALL of the following:
    (a) Every serviceId is a real id from the list below ✓
    (b) Cross-layer order strictly follows: ${layerOrderStr} ✓
    (c) Intra-layer dependency order is respected (Rule 2) ✓
    (d) All mandatory co-inclusions are satisfied (Rule 3) ✓
    (e) No excluded services appear for this goal type (Rule 4) ✓
    (f) Every action is grounded in official NVIDIA documentation ✓
    (g) The complete path genuinely solves the stated goal ✓
  Only set verified:true if every single check passes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVAILABLE SERVICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${serviceList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — strictly valid JSON, nothing else
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When path is valid (verified:true):
{
  "verified": true,
  "steps": [
    {
      "serviceId": "<exact id from list>",
      "role": "<3-6 word role label>",
      "action": "<1-2 sentence instruction grounded in official docs>"
    }
  ]
}

When path cannot be verified (verified:false):
{
  "verified": false,
  "message": "<clear 1-2 sentence explanation>",
  "suggestedServices": ["<id1>", "<id2>"]
}`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: goal },
      ],
      temperature: 0.1,
      max_tokens:  1000,
      response_format: { type: 'json_object' },
    });

    const text   = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text) as {
      verified?:          boolean;
      steps?:             Array<{ serviceId: string; role: string; action: string }>;
      message?:           string;
      suggestedServices?: string[];
    };

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

    // 1. Enforce cross-layer order
    steps = [...steps].sort((a, b) => {
      const layerA = serviceById.get(a.serviceId)?.layer ?? '';
      const layerB = serviceById.get(b.serviceId)?.layer ?? '';
      return LAYER_ORDER.indexOf(layerA) - LAYER_ORDER.indexOf(layerB);
    });

    // 2. Enforce intra-layer dependency order within each layer group
    const stepIds = steps.map((s) => s.serviceId);
    for (const [before, after] of INTRA_LAYER_ORDER) {
      const bi = stepIds.indexOf(before);
      const ai = stepIds.indexOf(after);
      if (bi !== -1 && ai !== -1 && bi > ai) {
        // Swap to correct order
        [steps[bi], steps[ai]] = [steps[ai], steps[bi]];
        stepIds[bi] = steps[bi].serviceId;
        stepIds[ai] = steps[ai].serviceId;
      }
    }

    // 3. Inject any missing mandatory co-inclusions
    for (const rule of MANDATORY_PAIRS) {
      const hasIf     = steps.some((s) => s.serviceId === rule.if);
      const hasThen   = steps.some((s) => s.serviceId === rule.thenInclude);
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

    // Re-sort after injections to restore layer order
    steps = steps.sort((a, b) => {
      const layerA = serviceById.get(a.serviceId)?.layer ?? '';
      const layerB = serviceById.get(b.serviceId)?.layer ?? '';
      return LAYER_ORDER.indexOf(layerA) - LAYER_ORDER.indexOf(layerB);
    });

    return NextResponse.json({ verified: true, goal, steps });
  } catch (err) {
    console.error('[generate-flow] Groq error:', err);
    return NextResponse.json({ error: 'AI generation failed — check GROQ_API_KEY' }, { status: 500 });
  }
}
