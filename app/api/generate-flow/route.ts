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
 *
 * Requires GROQ_API_KEY in .env.local
 */

import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { NVIDIA_SERVICES } from '@/data/nvidia';

// Layer ordering enforced left-to-right — steps must never go backwards
const LAYER_ORDER = ['access', 'sdk', 'framework', 'agent', 'serving', 'enterprise'];

// Official docs URLs mapped per layer for suggestion messages
const LAYER_DOCS: Record<string, string> = {
  access:     'https://developer.nvidia.com',
  sdk:        'https://developer.nvidia.com/cuda-toolkit',
  framework:  'https://www.nvidia.com/en-us/ai-data-science/nemo/',
  agent:      'https://developer.nvidia.com/nemotron',
  serving:    'https://developer.nvidia.com/nim',
  enterprise: 'https://www.nvidia.com/en-us/data-center/products/ai-enterprise/',
};

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

  // Build a rich service list showing layer, official URL, and description
  const serviceList = NVIDIA_SERVICES.map(
    (s) =>
      `  id:"${s.id}" | layer:${s.layer} | ${s.name}\n` +
      `    desc: ${s.shortDescription}\n` +
      `    docs: ${s.officialUrl}`,
  ).join('\n');

  const layerOrderStr = LAYER_ORDER.join(' → ');

  const systemPrompt = `You are a senior NVIDIA AI solutions architect with deep knowledge of NVIDIA's official product documentation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NON-NEGOTIABLE RULES (never violate)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE 1 — LAYER ORDER IS MANDATORY
  Steps must follow this exact left-to-right order: ${layerOrderStr}
  Later-layer services CANNOT appear before earlier-layer services.
  Skipping a layer is allowed. Reversing direction is NOT allowed.
  Example violation (FORBIDDEN): enterprise → access → serving
  Example valid (ALLOWED):       access → framework → serving → enterprise

RULE 2 — CANNOT VERIFY → SUGGEST SERVICES
  If the goal cannot be concretely addressed using the listed services and
  NVIDIA's official documented workflows, do NOT fabricate a path.
  Instead set verified:false, write a clear message, and list 1-4 serviceIds
  the user should investigate. This is better than a wrong answer.

RULE 3 — STRICTLY OFFICIAL DOCUMENTATION
  Every step must be grounded in what NVIDIA officially documents for that
  service. Do not invent connections, capabilities, or use-cases that are
  not present in official NVIDIA docs. The service list below includes the
  official description and documentation URL for reference.

RULE 4 — SELF-VERIFICATION REQUIRED
  Before finalising your answer, internally verify:
    (a) Is every serviceId in your steps a real id from the list?
    (b) Is the layer order strictly ${layerOrderStr}?
    (c) Is each step's action grounded in that service's official documentation?
    (d) Does the complete path actually solve the stated goal?
  Only set verified:true if ALL four checks pass.

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
      "serviceId": "<exact id>",
      "role": "<3-6 word role label>",
      "action": "<1-2 sentence instruction grounded in official docs>"
    }
  ]
}

When path cannot be verified (verified:false):
{
  "verified": false,
  "message": "<clear 1-2 sentence explanation of why a path cannot be formed>",
  "suggestedServices": ["<id1>", "<id2>"]
}`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: goal },
      ],
      temperature: 0.1,   // Lower temp = more rule-compliant
      max_tokens:  900,
      response_format: { type: 'json_object' },
    });

    const text   = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text) as {
      verified?:         boolean;
      steps?:            Array<{ serviceId: string; role: string; action: string }>;
      message?:          string;
      suggestedServices?: string[];
    };

    const validIds = new Set(NVIDIA_SERVICES.map((s) => s.id));

    // ── Unverified / no-path response ─────────────────────────────────────
    if (parsed.verified === false) {
      const suggested = (parsed.suggestedServices ?? [])
        .filter((id) => validIds.has(id))
        .map((id) => {
          const svc = NVIDIA_SERVICES.find((s) => s.id === id)!;
          return { id: svc.id, name: svc.name, officialUrl: svc.officialUrl };
        });

      return NextResponse.json(
        {
          verified: false,
          message:  parsed.message ?? 'No documented NVIDIA path found for this goal.',
          suggestedServices: suggested,
        },
        { status: 422 },
      );
    }

    // ── Valid path — enforce layer order strictly ─────────────────────────
    const rawSteps = (parsed.steps ?? []).filter((s) => validIds.has(s.serviceId));

    if (rawSteps.length === 0) {
      return NextResponse.json(
        {
          verified: false,
          message:  'The AI could not map your goal to any documented NVIDIA services. Try being more specific.',
          suggestedServices: [],
        },
        { status: 422 },
      );
    }

    // Sort steps by LAYER_ORDER to guarantee correct left-to-right ordering
    // (catches any residual layer-order violations from the model)
    const sortedSteps = [...rawSteps].sort((a, b) => {
      const layerA = NVIDIA_SERVICES.find((s) => s.id === a.serviceId)?.layer ?? '';
      const layerB = NVIDIA_SERVICES.find((s) => s.id === b.serviceId)?.layer ?? '';
      return LAYER_ORDER.indexOf(layerA) - LAYER_ORDER.indexOf(layerB);
    });

    return NextResponse.json({ verified: true, goal, steps: sortedSteps });
  } catch (err) {
    console.error('[generate-flow] Groq error:', err);
    return NextResponse.json({ error: 'AI generation failed — check GROQ_API_KEY' }, { status: 500 });
  }
}
