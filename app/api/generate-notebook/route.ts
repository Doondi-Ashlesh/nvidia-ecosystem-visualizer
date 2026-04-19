/**
 * POST /api/generate-notebook
 *
 * Generates a production-ready Jupyter notebook from a service path.
 * Uses real NVIDIA code patterns as grounding to prevent hallucinated APIs.
 *
 * WHY this file changed (Day 1 of production hardening):
 *   - LLM calls now go through lib/llm-client (provider-agnostic, replay-aware)
 *   - Request + response validated with zod schemas (lib/schemas.ts)
 *   - User-provided `goal` sanitised and wrapped in <user_goal> delimiters
 *   - System prompt carries INJECTION_GUARD
 *   - Every response carries a provenance header cell
 *
 * Procedures: docs/procedures/01-llm-route.md
 *             docs/procedures/02-validator.md
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import type { WorkflowStep, GoalSpec } from '@/types/ecosystem';
import { getRelevantPatterns } from '@/lib/notebook-patterns';
import { buildNotebookJson, toSourceLines } from '@/lib/workflow-notebook';
import type { NotebookCell } from '@/lib/workflow-notebook';
import { buildArchitecture } from '@/lib/scaffolding-templates';
import { completeChat } from '@/lib/llm-client';
import {
  GenerateNotebookRequestSchema,
  NotebookCellsSchema,
  sanitizeUserText,
  wrapUserBlock,
  INJECTION_GUARD,
  zodErrorsToStrings,
} from '@/lib/schemas';

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Check if parsed value looks like notebook cells (array with cell_type). */
function looksLikeCellArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = value[0] as Record<string, unknown>;
  return Boolean(first && typeof first === 'object' && 'cell_type' in first);
}

/**
 * Extract a JSON array from a possibly-fenced LLM response. Tolerant of
 * <think> tags, code fences, and trailing prose.
 */
function extractJsonArray(text: string): unknown[] {
  let cleaned = stripThinkTags(text);

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const trimmed = cleaned.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (looksLikeCellArray(parsed)) return parsed as unknown[];
    } catch {
      /* fall through */
    }
  }

  let searchFrom = 0;
  while (searchFrom < cleaned.length) {
    const start = cleaned.indexOf('[', searchFrom);
    if (start === -1) break;

    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '[') depth++;
      if (ch === ']') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end !== -1) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (looksLikeCellArray(parsed)) return parsed as unknown[];
      } catch {
        /* try next [ */
      }
      searchFrom = start + 1;
    } else {
      break;
    }
  }

  throw new Error(
    `No valid JSON cell array found in response (length=${text.length}).`,
  );
}

// ── Scaffolding context builder ─────────────────────────────────────────────

function buildScaffoldingContext(
  goalSpec: GoalSpec,
  steps: WorkflowStep[],
): string {
  const lines: string[] = [];
  lines.push(
    `PROJECT SPECIFICATION (use this as the plan the notebook implements):`,
  );
  lines.push('');
  lines.push(`Domain: ${goalSpec.domain}`);
  lines.push(`Use case: ${goalSpec.use_case_type}`);
  lines.push('');
  lines.push(`Summary: ${goalSpec.summary}`);
  lines.push('');

  if (goalSpec.performance_goals.length > 0) {
    lines.push(
      `Performance targets (the notebook should measure and print these):`,
    );
    for (const p of goalSpec.performance_goals) {
      lines.push(`  - ${p.metric}: ${p.target}`);
    }
    lines.push('');
  }

  if (goalSpec.constraints.compliance.length > 0) {
    lines.push(
      `Compliance: ${goalSpec.constraints.compliance.join(', ')}`,
    );
    lines.push(
      `  — code must reflect these (de-identification, audit logging, guardrails)`,
    );
    lines.push('');
  }

  if (goalSpec.constraints.hardware) {
    lines.push(`Hardware target: ${goalSpec.constraints.hardware}`);
    lines.push('');
  }

  if (goalSpec.inferred_requirements.length > 0) {
    lines.push(`Inferred requirements (notebook should address these):`);
    for (const r of goalSpec.inferred_requirements.slice(0, 5)) {
      lines.push(`  - ${r.requirement}`);
    }
    if (goalSpec.inferred_requirements.length > 5) {
      lines.push(
        `  - (+${goalSpec.inferred_requirements.length - 5} more)`,
      );
    }
    lines.push('');
  }

  lines.push(`DATA FLOW (architecture):`);
  lines.push('```');
  lines.push(buildArchitecture(steps).split('```')[1]?.trim() ?? '');
  lines.push('```');

  return lines.join('\n');
}

// ── Provenance header ───────────────────────────────────────────────────────

function buildProvenanceCell(opts: {
  goal: string;
  providerLabel: string;
  modelTag: string;
  latencyMs: number;
  attempts: number;
  correlationId: string;
}): NotebookCell {
  const lines = [
    '<!-- Generated by NVIDIA Ecosystem Pipeline. Do not edit this cell. -->',
    '',
    `**Goal:** ${opts.goal.slice(0, 200)}${opts.goal.length > 200 ? '…' : ''}`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| Model | \`${opts.modelTag}\` |`,
    `| Provider | \`${opts.providerLabel}\` |`,
    `| Generated | ${new Date().toISOString()} |`,
    `| Latency | ${opts.latencyMs} ms |`,
    `| Attempts | ${opts.attempts} |`,
    `| Correlation ID | \`${opts.correlationId}\` |`,
  ];
  return {
    cell_type: 'markdown',
    metadata: {},
    source: toSourceLines(lines.join('\n')),
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const t0 = Date.now();

  // 1. Parse + validate request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 },
    );
  }

  const parsed = GenerateNotebookRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        issues: zodErrorsToStrings(parsed.error),
      },
      { status: 400 },
    );
  }
  const { goal: rawGoal, steps, goalSpec } = parsed.data;

  // 2. Sanitize user-provided strings
  const safeGoal = sanitizeUserText(rawGoal);

  // 3. Assemble prompts
  const serviceIds = steps.map((s) => s.serviceId);
  const patterns = getRelevantPatterns(serviceIds);
  const scaffoldingContext = goalSpec
    ? buildScaffoldingContext(goalSpec, steps)
    : '';

  const systemPrompt = `You are a senior NVIDIA AI engineer generating production-ready Jupyter notebooks.

CRITICAL: Use the REAL NVIDIA CODE PATTERNS below. Do NOT invent API calls or function names.

${patterns}

NOTEBOOK STRUCTURE (narrative-driven, matches NVIDIA GenerativeAIExamples pattern):
The notebook should tell a story, not just list services. Follow this sequence:

  1. Overview cell (markdown): the goal, expected outcome, and metrics to improve
  2. Prerequisites cell (markdown): hardware, credentials, dependencies
  3. Setup cell (code): pip installs + env var checks
  4. Baseline demo (if applicable): deploy existing model, run a sample query, show the baseline weakness
  5. For each service in the path, one markdown + one code cell implementing that step
  6. Before/after comparison (if training/fine-tuning is involved): same query on improved model, show measurable difference
  7. Evaluation cell: run a standardized benchmark, display the metrics
  8. Summary markdown: what was accomplished, next steps, optional cleanup

Rules:
- Use environment variables for credentials (os.environ["NVIDIA_API_KEY"])
- Include a pip install cell up front with all required packages
- Each code cell must be self-contained with proper imports
- Use the exact API patterns from the grounding above — do NOT invent CLIs like \`nemo train\` that don't exist
- When training/fine-tuning is in the path, use a REAL public dataset (HuggingFace, LibriSpeech, MovieLens, etc.) via auto-download — do not assume data exists locally
- Prefer pretrained models via \`.from_pretrained()\` over loading local checkpoints
- Source must be a single string (not an array)
- Do NOT write \`subprocess.run(["nemo", "train", ...])\` — NeMo has no such CLI. Use the Python SDK or NeMoMicroservices SDK.

${INJECTION_GUARD}

Output ONLY a JSON array of cells:
[{"cell_type": "markdown", "source": "# Title\\n\\nExplanation..."}, {"cell_type": "code", "source": "import os\\n..."}]`;

  const baseUserPrompt = scaffoldingContext
    ? `GOAL:\n${wrapUserBlock(safeGoal)}\n\n${scaffoldingContext}\n\nSERVICE PATH (JSON):\n${JSON.stringify(steps, null, 2)}`
    : `GOAL:\n${wrapUserBlock(safeGoal)}\n\nSERVICE PATH:\n${JSON.stringify(steps, null, 2)}`;

  // 4. Call model with parse+schema re-prompt loop (up to 3 attempts)
  let cells: unknown[] | null = null;
  let feedback = '';
  let lastChat:
    | Awaited<ReturnType<typeof completeChat>>
    | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const userPrompt =
      attempt === 1
        ? baseUserPrompt
        : baseUserPrompt +
          '\n\nYour previous response had these issues — fix them:\n' +
          feedback +
          '\n\nRESPOND WITH ONLY A JSON ARRAY. No <think> tags. Start with [';

    try {
      lastChat = await completeChat({
        stage: 'notebook',
        fixtureName: `goal-${correlationId.slice(0, 8)}`,
        fixtureInput: { goal: safeGoal, steps, goalSpec },
        correlationId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        top_p: 0.95,
        max_tokens: 32768,
        maxAttempts: 1, // llm-client's retries are for network; we handle parse here
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[generate-notebook][${correlationId}] chat failed attempt ${attempt}: ${msg}`,
      );
      feedback = `previous attempt errored: ${msg}`;
      if (attempt >= 3) {
        return NextResponse.json(
          { error: 'LLM provider failure', detail: msg, correlationId },
          { status: 502 },
        );
      }
      continue;
    }

    // Stream truncation: give the model another shot with the same prompt.
    if (lastChat.finishReason === 'length' && attempt < 3) {
      feedback = 'response was truncated; keep the JSON array shorter';
      continue;
    }

    let extracted: unknown[];
    try {
      extracted = extractJsonArray(lastChat.content);
    } catch (err) {
      feedback = `could not parse a JSON array from your response. ${err instanceof Error ? err.message : err}`;
      if (attempt >= 3) {
        return NextResponse.json(
          {
            error: 'Failed to parse notebook cells from LLM response',
            correlationId,
          },
          { status: 502 },
        );
      }
      continue;
    }

    // Schema validation (layer 1 — structure).
    const schemaResult = NotebookCellsSchema.safeParse(extracted);
    if (!schemaResult.success) {
      const issues = zodErrorsToStrings(schemaResult.error);
      feedback = `schema violations: ${issues.join('; ')}`;
      if (attempt >= 3) {
        return NextResponse.json(
          {
            error: 'Notebook cells failed schema validation',
            issues,
            correlationId,
          },
          { status: 502 },
        );
      }
      continue;
    }

    cells = schemaResult.data;
    break;
  }

  if (!cells || !lastChat) {
    return NextResponse.json(
      { error: 'Failed to generate notebook', correlationId },
      { status: 500 },
    );
  }

  // 5. Build notebook — prepend provenance header cell
  const dataCells: NotebookCell[] = cells.map((raw) => {
    const cell = raw as { cell_type?: string; source?: string | string[] };
    const srcRaw = cell.source ?? '';
    const src = typeof srcRaw === 'string' ? srcRaw : srcRaw.join('');

    if (cell.cell_type === 'code') {
      return {
        cell_type: 'code',
        metadata: {},
        execution_count: null,
        outputs: [],
        source: toSourceLines(src),
      };
    }
    return {
      cell_type: 'markdown',
      metadata: {},
      source: toSourceLines(src),
    };
  });

  const provenance = buildProvenanceCell({
    goal: safeGoal,
    providerLabel: lastChat.providerLabel,
    modelTag: lastChat.modelTag,
    latencyMs: Date.now() - t0,
    attempts: lastChat.attempts,
    correlationId,
  });

  const notebook = buildNotebookJson([provenance, ...dataCells]);
  const body = JSON.stringify(notebook, null, 2);
  const latencyMs = Date.now() - t0;

  console.log(
    `[generate-notebook][${correlationId}] OK cells=${dataCells.length} ` +
      `provider=${lastChat.providerLabel} model=${lastChat.modelTag} ` +
      `ms=${latencyMs} tokens=${lastChat.usage?.total_tokens ?? '?'}`,
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="nvidia-pipeline.ipynb"`,
      'X-Latency-Ms': String(latencyMs),
      'X-Cell-Count': String(dataCells.length + 1),
      'X-Correlation-Id': correlationId,
      'X-Model-Tag': lastChat.modelTag,
    },
  });
}
