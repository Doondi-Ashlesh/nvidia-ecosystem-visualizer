/**
 * POST /api/generate-flow
 *
 * Stage 2: User goal → NVIDIA service path with data flow.
 *
 * Single-call architecture (Experiment 8 — avg 8.7/10 across 7 enterprise test cases):
 *   - Data-flow prompt: model describes inputs/outputs per service
 *   - Services that can't be placed in the data flow get naturally excluded
 *   - No hardcoded rules, no keyword triggers, no adversary loop
 *   - verified:false escape for non-NVIDIA/gibberish goals
 *
 * Accepts { goal: string } or { goalSpec: GoalSpec } from Stage 1.
 *
 * Stack: nvidia/nemotron-3-super-120b-a12b via NVIDIA NIM API
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { NVIDIA_SERVICES } from '@/data/nvidia';
import type { GoalSpec, WorkflowStep } from '@/types/ecosystem';
import { completeChat } from '@/lib/llm-client';
import {
  WorkflowStepsSchema,
  GoalSpecSchema,
  sanitizeUserText,
  wrapUserBlock,
  INJECTION_GUARD,
  zodErrorsToStrings,
} from '@/lib/schemas';
import { validatePath, buildPathRepromptFeedback } from '@/lib/validators/path';

// ── Constants ────────────────────────────────────────────────────────────────

const LAYER_ORDER = ['access', 'sdk', 'framework', 'agent', 'serving', 'enterprise'];

const SERVICE_LIST = NVIDIA_SERVICES.map(
  (s) => `${s.id} (${s.layer}): ${s.shortDescription}`
).join('\n');

const SYSTEM_PROMPT = `You are a senior NVIDIA AI solutions architect. Produce a complete production-ready implementation path using NVIDIA services for the user's goal.

A production-ready path covers the FULL lifecycle: data preparation, model training/selection, optimization, serving, evaluation, safety/compliance, and enterprise deployment. Do not skip stages — a system that cannot be evaluated or monitored is not production-ready.

Describe the DATA FLOW — what goes into each service and what comes out. Every service must have clear inputs and outputs connecting it to other services in the path. If a service cannot be placed in the data flow with concrete inputs and outputs, do not include it.

If the goal cannot be addressed with NVIDIA services, or if the input is not a valid AI/ML goal, return verified: false.

AVAILABLE SERVICES:
${SERVICE_LIST}

Respond with ONLY valid JSON:

When path is valid:
{"verified": true, "steps": [{"serviceId": "<exact id>", "role": "<role>", "action": "<instruction>", "inputs": ["<in>"], "outputs": ["<out>"]}]}

When goal cannot be addressed:
{"verified": false, "message": "<explanation>", "suggestedServices": ["<id>"]}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text.trim();
}

function splitThinking(raw: string): { reasoning: string; answer: string } {
  const stripped = raw.trim();
  const patterns: RegExp[] = [
    /<think>([\s\S]*?)<\/think>/i,
    /<redacted_thinking>([\s\S]*?)<\/think>/i,
    /<redacted_thinking>([\s\S]*?)<\/redacted_thinking>/i,
  ];
  for (const re of patterns) {
    const m = stripped.match(re);
    if (m) {
      return { reasoning: (m[1] ?? '').trim(), answer: stripped.replace(re, '').trim() };
    }
  }
  if (stripped && !stripped.startsWith('{') && !stripped.startsWith('```')) {
    const jsonStart = stripped.indexOf('{');
    if (jsonStart !== -1) {
      return { reasoning: stripped.slice(0, jsonStart).trim(), answer: stripped.slice(jsonStart) };
    }
  }
  return { reasoning: '', answer: stripped };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(raw: string): any {
  const cleaned = stripFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    if (start === -1) throw new Error('No JSON object found');
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1)); }
    }
    throw new Error(`JSON parse failed. Length: ${raw.length}`);
  }
}

// ── Build prompt from GoalSpec ──────────────────────────────────────────────

function buildGoalSpecPrompt(spec: GoalSpec): string {
  const parts: string[] = [
    `DOMAIN: ${spec.domain}`,
    `USE CASE: ${spec.use_case_type}`,
    `GOAL: ${spec.summary}`,
    '',
    'PERFORMANCE TARGETS (the path MUST support achieving these):',
    ...spec.performance_goals.map((p) => `  - ${p.metric}: ${p.target}`),
    '',
    'CONSTRAINTS:',
    ...(spec.constraints.compliance.length ? [`  Compliance: ${spec.constraints.compliance.join(', ')}`] : []),
    ...(spec.constraints.hardware ? [`  Hardware: ${spec.constraints.hardware}`] : []),
    ...(spec.constraints.scale ? [`  Scale: ${spec.constraints.scale}`] : []),
    '',
    'INFERRED REQUIREMENTS (include services that address these):',
    ...spec.inferred_requirements.map((r) => `  - ${r.requirement}`),
  ];
  return parts.join('\n');
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const body = (rawBody ?? {}) as { goal?: string; goalSpec?: GoalSpec };

  // Validate goalSpec shape if present (prevents malformed client payloads
  // from contaminating the stage 2 prompt).
  let goalSpec: GoalSpec | null = null;
  if (body.goalSpec) {
    const specCheck = GoalSpecSchema.safeParse(body.goalSpec);
    if (!specCheck.success) {
      return NextResponse.json(
        { error: 'Invalid goalSpec', issues: zodErrorsToStrings(specCheck.error) },
        { status: 400 },
      );
    }
    goalSpec = specCheck.data as GoalSpec;
  }

  const rawGoal = typeof body.goal === 'string' ? body.goal : '';
  const safeGoal = sanitizeUserText(rawGoal);
  const userPrompt = goalSpec
    ? buildGoalSpecPrompt(goalSpec)
    : wrapUserBlock(safeGoal);

  if (!userPrompt) {
    return NextResponse.json({ error: 'Goal or GoalSpec is required' }, { status: 400 });
  }

  const validIds = new Set(NVIDIA_SERVICES.map((s) => s.id));
  const serviceById = new Map(NVIDIA_SERVICES.map((s) => [s.id, s]));

  try {
    const t0 = Date.now();
    const MAX_RETRIES = 3;
    let parsed: Record<string, unknown> | null = null;
    let reasoning = '';
    // Semantic feedback appended to next prompt when validatePath finds issues.
    let semanticFeedback = '';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const maxTokens = attempt > 1 ? 8192 : 6144;
      let userContent = attempt > 1
        ? userPrompt + '\n\nRESPOND WITH ONLY JSON. No <think> tags. Start with {'
        : userPrompt;
      if (semanticFeedback) {
        userContent += '\n\n' + semanticFeedback;
      }

      let chat;
      try {
        chat = await completeChat({
          stage: 'path',
          fixtureName: `flow-${correlationId.slice(0, 8)}`,
          fixtureInput: { goal: safeGoal, goalSpec },
          correlationId,
          messages: [
            { role: 'system', content: `${SYSTEM_PROMPT}\n\n${INJECTION_GUARD}` },
            { role: 'user', content: userContent },
          ],
          temperature: 0,
          top_p: 0.95,
          max_tokens: maxTokens,
          maxAttempts: 1,
        });
      } catch (err) {
        console.warn(`[generate-flow][${correlationId}] chat error attempt ${attempt}:`, err);
        if (attempt >= MAX_RETRIES) throw err;
        continue;
      }

      const rawContent = chat.content;
      const { reasoning: thinkReasoning, answer } = splitThinking(rawContent);
      reasoning = thinkReasoning;

      console.log(`[generate-flow][${correlationId}] Attempt ${attempt}: ${rawContent.length}ch, finish=${chat.finishReason}`);

      if (chat.finishReason === 'length' && attempt < MAX_RETRIES) {
        console.warn(`[generate-flow][${correlationId}] Truncated — retrying`);
        continue;
      }

      try {
        parsed = parseJson(answer);
      } catch (err) {
        console.warn(`[generate-flow][${correlationId}] Parse failed attempt ${attempt}: ${err instanceof Error ? err.message : err}`);
        if (attempt >= MAX_RETRIES) throw err;
        continue;
      }

      // If the model returned verified:false there's no semantic check to run.
      if (parsed?.verified === false) break;

      // Semantic path validation — feeds specific issues back as re-prompt.
      // Only runs when a GoalSpec is available (need use-case context for
      // LLM-misfit detection). Without GoalSpec we skip to schema stage.
      if (goalSpec && Array.isArray(parsed?.steps) && parsed.steps.length > 0) {
        const semantic = validatePath(parsed.steps as WorkflowStep[], goalSpec);
        if (semantic.kind === 'clean') {
          break; // clean path — done
        }

        console.log(`[generate-flow][${correlationId}] Attempt ${attempt} semantic kind=${semantic.kind}; violations=${semantic.violations.length}`);

        // Hard violations (unknown service id / layer order / duplicates) and
        // soft violations (LLM misfit / disconnected flow) both trigger a
        // re-prompt while budget remains. On final attempt we accept the path
        // and record the violations in the response so the UI/caller can warn.
        if (attempt < MAX_RETRIES) {
          semanticFeedback = buildPathRepromptFeedback(semantic);
          continue;
        }
      }

      break; // no GoalSpec, or final attempt — accept what we have
    }

    if (!parsed) {
      return NextResponse.json({ error: 'Failed to generate path' }, { status: 500 });
    }

    // Handle verified: false
    if (parsed.verified === false) {
      const suggested = ((parsed.suggestedServices ?? []) as string[])
        .filter((id) => validIds.has(id))
        .map((id) => ({ id, name: serviceById.get(id)!.name, officialUrl: serviceById.get(id)!.officialUrl }));
      return NextResponse.json({
        verified: false,
        message: parsed.message ?? 'Cannot address this goal with NVIDIA services.',
        suggestedServices: suggested,
      }, { status: 422 });
    }

    // Validate, deduplicate, and sort steps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawSteps = ((parsed.steps ?? []) as any[]).filter((s) => validIds.has(s.serviceId));
    // Deduplicate by serviceId — keep first occurrence (has richer context from model)
    const seen = new Set<string>();
    let steps = rawSteps.filter((s) => {
      if (seen.has(s.serviceId)) return false;
      seen.add(s.serviceId);
      return true;
    });

    if (steps.length === 0) {
      return NextResponse.json({
        verified: false,
        message: 'Could not map your goal to NVIDIA services. Try being more specific.',
        suggestedServices: [],
      }, { status: 422 });
    }

    // Sort by layer order for graph
    steps = steps.sort((a, b) => {
      const layerA = serviceById.get(a.serviceId)?.layer ?? '';
      const layerB = serviceById.get(b.serviceId)?.layer ?? '';
      return LAYER_ORDER.indexOf(layerA) - LAYER_ORDER.indexOf(layerB);
    });

    // Use catalog shortDescription as role for UI
    steps = steps.map((s) => {
      const svc = serviceById.get(s.serviceId);
      return { ...s, role: svc?.shortDescription ?? s.role };
    });

    // Final schema validation — guarantees Stage 3 receives well-formed path.
    const stepsCheck = WorkflowStepsSchema.safeParse(steps);
    if (!stepsCheck.success) {
      const issues = zodErrorsToStrings(stepsCheck.error);
      console.error(`[generate-flow][${correlationId}] steps schema violations: ${issues.join('; ')}`);
      return NextResponse.json(
        { error: 'Generated path failed schema validation', issues, correlationId },
        { status: 502 },
      );
    }

    // Final semantic validation — report residual violations (post re-prompt
    // loop + post layer-sort) so the UI can surface warnings. This is the
    // "what survived" signal; a clean run returns an empty array.
    const residualViolations = goalSpec
      ? validatePath(stepsCheck.data as WorkflowStep[], goalSpec).violations
      : [];
    if (residualViolations.length > 0) {
      console.warn(
        `[generate-flow][${correlationId}] residual violations after retries: ${residualViolations.map((v) => v.code + ':' + (v.serviceId ?? '')).join(', ')}`,
      );
    }

    return NextResponse.json({
      verified: true,
      goal: goalSpec?.summary ?? safeGoal,
      goalSpecUsed: goalSpec !== null,
      steps: stepsCheck.data,
      reasoning: reasoning || null,
      latencyMs: Date.now() - t0,
      correlationId,
      violations: residualViolations, // empty array when clean
    });

  } catch (err: unknown) {
    console.error('[generate-flow] Error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      error: msg.includes('429') ? 'Rate limit — try again in a few seconds' : 'Path generation failed',
      detail: msg,
    }, { status: 500 });
  }
}
