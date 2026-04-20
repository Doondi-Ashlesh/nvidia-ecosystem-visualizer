/**
 * POST /api/fix-notebook-cell
 *
 * Given one failing notebook cell and its runtime error, return a fixed
 * version of that cell's source.
 *
 * WHY: this is the self-improvement loop's LLM entry point. Narrow-scope
 * fix calls (one cell, concrete error, correct reference APIs in context)
 * are the pattern where LLMs reliably produce correct code. Contrast with
 * generating a whole notebook: the big prompt and implicit planning burden
 * are what drive hallucinations. Tell the model exactly what's broken,
 * show it the real error, give it the allowed API surface — and it fixes
 * things cleanly.
 *
 * Input (zod-validated):
 *   {
 *     cellSource: string,             // the broken cell's current code
 *     errorName: string,              // e.g. "ModuleNotFoundError"
 *     errorMessage: string,           // e.g. "No module named 'cuml.neural_network'"
 *     errorTraceback?: string[],      // raw Python traceback lines
 *     serviceIds: string[],           // services in the notebook's path — drives grounding
 *     goal?: string,                  // optional project goal — provides broader context
 *     context?: {
 *       priorCellsSummary?: string;   // optional: 1-line summaries of previous cells
 *       variablesInScope?: string[];  // optional: variables the fixed cell can assume exist
 *     }
 *   }
 *
 * Output:
 *   { fixedSource: string, notes: string, correlationId: string }
 *
 * Procedure: docs/procedures/01-llm-route.md
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { completeChat } from '@/lib/llm-client';
import { getRelevantPatterns } from '@/lib/notebook-patterns';
import {
  sanitizeUserText,
  wrapUserBlock,
  INJECTION_GUARD,
  zodErrorsToStrings,
} from '@/lib/schemas';

// ──────────────────────────────────────────────────────────────────────
// Request schema
// ──────────────────────────────────────────────────────────────────────

const FixCellRequestSchema = z.object({
  cellSource: z.string().min(1).max(40_000),
  errorName: z.string().min(1).max(200),
  errorMessage: z.string().min(1).max(5_000),
  errorTraceback: z.array(z.string().max(5_000)).max(100).optional(),
  serviceIds: z.array(z.string().min(1).max(100)).max(25),
  goal: z.string().max(2_000).optional(),
  context: z
    .object({
      priorCellsSummary: z.string().max(5_000).optional(),
      variablesInScope: z.array(z.string().max(200)).max(100).optional(),
    })
    .optional(),
});

// ──────────────────────────────────────────────────────────────────────
// Response extraction
// ──────────────────────────────────────────────────────────────────────

/**
 * The LLM returns either a fenced code block OR raw Python. Extract the
 * code and strip any surrounding prose. If the model emits `### FIXED
 * CODE` / `### NOTES` sections we honour those; otherwise best-effort.
 */
function extractFixAndNotes(text: string): { fixedSource: string; notes: string } {
  // Strip <think> tags first
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Preferred format: ```python … ``` (closed fence)
  const closedFence = cleaned.match(/```(?:python|py)?\s*\n([\s\S]*?)\n?```/);
  if (closedFence) {
    const fixed = closedFence[1];
    const notes = cleaned.slice(0, cleaned.indexOf(closedFence[0])).trim();
    return { fixedSource: fixed, notes };
  }

  // Truncated-fence fallback: `\`\`\`python\n` opened but response ended
  // before closing fence (model hit max_tokens). Pull everything after
  // the opening fence marker.
  const openFence = cleaned.match(/```(?:python|py)?\s*\n/);
  if (openFence) {
    const idx = openFence.index! + openFence[0].length;
    return {
      fixedSource: cleaned.slice(idx).replace(/```\s*$/, '').trim(),
      notes: cleaned.slice(0, openFence.index).trim(),
    };
  }

  // Fallback: look for a "### FIXED" or "FIXED CODE:" header
  const headerMatch = cleaned.match(/(?:^|\n)#{0,3}\s*(?:FIXED|FIXED\s+CODE|CODE)[:\s]*\n?([\s\S]+)$/i);
  if (headerMatch) {
    return {
      fixedSource: headerMatch[1].trim(),
      notes: cleaned.slice(0, headerMatch.index).trim(),
    };
  }

  // Last resort: treat the whole response as code (model followed the
  // "code only" instruction). Strip any dangling fence markers.
  cleaned = cleaned.replace(/^```(?:python|py)?\s*\n?/, '').replace(/```\s*$/, '');
  return { fixedSource: cleaned.trim(), notes: '' };
}

// ──────────────────────────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 },
    );
  }

  const parsed = FixCellRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: zodErrorsToStrings(parsed.error) },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Sanitise free-text fields that may carry user content.
  const safeGoal = sanitizeUserText(body.goal ?? '', 2_000);
  const safeErrorMessage = sanitizeUserText(body.errorMessage, 5_000);

  // Grounding patterns for the services in this notebook's path. We give
  // the model ONLY the patterns relevant to its task — not the whole
  // catalog — so its context stays focused.
  const patterns = getRelevantPatterns(body.serviceIds);

  // Assemble traceback into one block
  const tracebackText = (body.errorTraceback ?? [])
    .join('\n')
    .replace(/\x1b\[[0-9;]*m/g, '') // strip ANSI colour codes
    .slice(0, 4_000); // hard cap

  const priorContext = body.context?.priorCellsSummary
    ? `\n\nPRIOR CELLS (for context):\n${body.context.priorCellsSummary.slice(0, 3_000)}`
    : '';

  const variablesContext = body.context?.variablesInScope?.length
    ? `\n\nVARIABLES ALREADY IN SCOPE (do NOT redefine):\n${body.context.variablesInScope.slice(0, 30).join(', ')}`
    : '';

  const goalContext = safeGoal
    ? `\n\nPROJECT GOAL:\n${wrapUserBlock(safeGoal)}`
    : '';

  // ── System prompt ──────────────────────────────────────────────────
  const systemPrompt = `You are a senior NVIDIA AI engineer fixing a single broken cell in a larger Jupyter notebook.

Your one task: take the failing cell's current source, look at the exact error it produced, and produce a fixed version of just this cell's source. Do not rewrite the whole notebook. Do not add or remove cells.

CRITICAL: Use the REAL NVIDIA CODE PATTERNS below. Do NOT invent API calls, module names, or function signatures.

${patterns}

COMMON FIX CLASSES (rank your response against these):

1. **ModuleNotFoundError / ImportError** → the imported module is either fake (e.g. \`cuml.neural_network\` doesn't exist) or not installable the way the current code tries. Replace with the correct grounded alternative. If the failure is in a pip-install cell:
   - For RAPIDS (cuDF / cuML / cuGraph): \`!pip install cudf-cu12 cuml-cu12 cugraph-cu12 --extra-index-url=https://pypi.nvidia.com\`
   - For PyTorch with CUDA: \`!pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121\`
   - For TensorRT: \`!pip install tensorrt\` (PyPI)
   - For other packages: use plain \`!pip install pkg>=x.y\` — NEVER use \`package=N.M\` (single-equals is invalid in pip), NEVER use \`-c channel\` (that's conda syntax), NEVER use \`python -m mamba\` or \`python -m conda\` (those don't exist as \`-m\` modules).
   - Use Jupyter magic \`!pip install\` rather than \`subprocess.check_call([..., 'pip', 'install', ...])\` — cleaner, fewer failure modes.

2. **AttributeError on deprecated API** → migrate to modern API (e.g. TensorRT 8+ uses \`create_builder_config()\` + \`set_flag(BuilderFlag.FP16)\` instead of \`builder.fp16_mode = True\`).

3. **NameError** → the variable doesn't exist. Either define it here, import it, or remove the code that uses it. Do NOT invent a definition that won't work.

4. **TypeError / ValueError on argument shapes** → check the real API signature in the grounding and call it correctly.

5. **CalledProcessError on subprocess** → the command doesn't exist (e.g. \`python -m mamba\`, \`nemo train\`). Use the real CLI or SDK.

RULES:
- Output ONLY a single fenced Python code block \`\`\`python … \`\`\` containing the fixed source.
- You may include a short 1-2 sentence note ABOVE the fence explaining what you changed. No other prose.
- Preserve variable names and overall cell structure unless the bug requires renaming.
- If the error is a cascade (e.g. you see \`NameError: X not defined\` but X was supposed to be made in a prior cell that itself failed), leave this cell mostly unchanged and add a comment \`# depends on upstream cell being fixed\`. Do NOT invent X here.

${INJECTION_GUARD}`;

  // ── User prompt ────────────────────────────────────────────────────
  const userPrompt = [
    '=== CURRENT CELL SOURCE (broken) ===',
    '```python',
    body.cellSource,
    '```',
    '',
    '=== RUNTIME ERROR ===',
    `Name: ${body.errorName}`,
    `Message: ${safeErrorMessage}`,
    tracebackText ? `\nTraceback:\n${tracebackText}` : '',
    goalContext,
    priorContext,
    variablesContext,
    '',
    'Produce the fixed source for JUST this cell.',
  ].join('\n');

  try {
    const chat = await completeChat({
      stage: 'notebook', // reuse notebook stage for fixture bucketing
      fixtureName: `fixcell-${correlationId.slice(0, 8)}`,
      fixtureInput: { cellSource: body.cellSource.slice(0, 500), errorName: body.errorName },
      correlationId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      top_p: 0.95,
      max_tokens: 6_144, // one cell — enough for a full rewrite with a closing fence
      maxAttempts: 2,
    });

    const { fixedSource, notes } = extractFixAndNotes(chat.content);

    if (!fixedSource.trim()) {
      return NextResponse.json(
        {
          error: 'LLM returned an empty fix',
          correlationId,
          rawContent: chat.content.slice(0, 500),
        },
        { status: 502 },
      );
    }

    console.log(
      `[fix-notebook-cell][${correlationId}] OK errorName=${body.errorName} ` +
        `input=${body.cellSource.length}ch fixed=${fixedSource.length}ch ` +
        `ms=${chat.latencyMs}`,
    );

    return NextResponse.json({
      fixedSource,
      notes,
      correlationId,
      latencyMs: chat.latencyMs,
      modelTag: chat.modelTag,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fix-notebook-cell][${correlationId}] FAILED: ${msg}`);
    return NextResponse.json(
      { error: 'Fix-pass failed', detail: msg, correlationId },
      { status: 502 },
    );
  }
}
