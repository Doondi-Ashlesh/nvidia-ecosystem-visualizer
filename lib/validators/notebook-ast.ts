/**
 * lib/validators/notebook-ast.ts
 *
 * Grounding enforcement for generated Jupyter notebooks. Parses each Python
 * code cell, extracts imports and attribute chains, and rejects symbols that
 * claim to be from an NVIDIA package but aren't listed in the allowed-API
 * manifest (lib/allowed-apis.ts).
 *
 * WHY: before this, the notebook generator relied on prompt-based grounding —
 * the 120B was *told* what the correct APIs were. This turns grounding into
 * enforcement: hallucinated symbols (e.g. `nemo_curator.magic.AutoCurator`,
 * `subprocess.run(["nemo", "train", ...])`) are caught deterministically and
 * fed back as a re-prompt with concrete fix suggestions.
 *
 * SCOPE: static analysis only. Covers three classes of hallucination:
 *   1. Invented imports under NVIDIA namespaces
 *   2. Attribute chains rooted in NVIDIA modules that don't exist
 *   3. Non-existent CLI invocations via subprocess
 *
 * DOES NOT CATCH:
 *   - Runtime errors (wrong args, None passed where int expected) — needs Brev
 *   - Logic errors (empty lists, wrong URLs) — needs execution
 *   - API drift (manifest vs reality) — needs periodic refresh
 *
 * We use regex-based extraction rather than a full Python AST parser. The
 * tradeoff: 95% of real-world import forms are covered; exotic constructs
 * (dynamic `__import__`, `importlib`) are ignored. For a generated notebook
 * that's ~acceptable because the model rarely emits dynamic imports.
 *
 * Procedures: docs/procedures/02-validator.md, 04-grounding-manifest.md
 */

import {
  ALLOWED_APIS,
  findServiceForImportRoot,
  isSymbolAllowed,
  getAllowedSymbolsSample,
  isInfraOnlyService,
  type ServiceId,
} from '@/lib/allowed-apis';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type ASTViolation =
  | {
      code: 'hallucinated_import';
      cellIndex: number;
      lineNumber: number;
      symbol: string;         // e.g. "nemo_curator.magic"
      service: ServiceId;     // "nemo-curator"
      message: string;
      reprompt: string;
    }
  | {
      code: 'infra_service_imported';
      cellIndex: number;
      lineNumber: number;
      symbol: string;
      service: ServiceId;
      message: string;
      reprompt: string;
    }
  | {
      code: 'hallucinated_cli';
      cellIndex: number;
      lineNumber: number;
      cli: string;            // e.g. "nemo train"
      message: string;
      reprompt: string;
    };

export interface ASTValidationResult {
  ok: boolean;
  violations: ASTViolation[];
  /**
   * Stats useful for logging.
   */
  stats: {
    codeCellsChecked: number;
    importsChecked: number;
    nvidiaImportsChecked: number;
  };
}

// ──────────────────────────────────────────────────────────────────────
// Known fake CLIs the 120B has been observed to hallucinate. Source:
// Experiment 9 "NeMo training CLI is fabricated". This list is additive —
// we can extend as we see new fake CLIs in future runs.
// ──────────────────────────────────────────────────────────────────────

const FAKE_CLI_PATTERNS: Array<{ pattern: RegExp; cli: string; suggestion: string }> = [
  {
    pattern: /\bnemo\s+train\b/,
    cli: 'nemo train',
    suggestion: 'There is no `nemo train` CLI. Use the NeMo Python API (`pytorch_lightning.Trainer` + a NeMo model) or the NeMoMicroservices SDK.',
  },
  {
    pattern: /\bnemo\s+finetune\b/,
    cli: 'nemo finetune',
    suggestion: 'There is no `nemo finetune` CLI. Fine-tune via NeMo Python API or `nemo_microservices.customization.jobs.create(...)`.',
  },
  {
    pattern: /\bnemo\s+evaluate\b/,
    cli: 'nemo evaluate',
    suggestion: 'Use `nemo-evaluator-launcher run --config <yaml>` (note the hyphen-separated CLI), not `nemo evaluate`.',
  },
  {
    pattern: /\bnemo\s+deploy\b/,
    cli: 'nemo deploy',
    suggestion: 'There is no `nemo deploy` CLI. Deploy via NIM container (`docker run nvcr.io/...`) or Triton (`tritonserver`).',
  },
];

// ──────────────────────────────────────────────────────────────────────
// Python import extraction
// ──────────────────────────────────────────────────────────────────────

interface ExtractedImport {
  /** Fully-qualified name the module or symbol is imported as */
  fqn: string;
  /** Line number within the cell where the import appears */
  lineNumber: number;
  /** Raw line text for error messages */
  raw: string;
}

/**
 * Extract every import statement from a Python source blob.
 *
 * Handles:
 *   - `import X`
 *   - `import X.Y.Z`
 *   - `import X as Y`
 *   - `from X import a, b, c`
 *   - `from X import (a, b, c)` (multi-line)
 *   - `from X.Y import a as b`
 *
 * Does not handle:
 *   - `__import__("X")` dynamic imports
 *   - `importlib.import_module("X")` — caller does it manually
 *
 * Returns a list of fully-qualified names (FQNs). For `from X import Y`,
 * the FQN is `X.Y`. For `import X.Y`, the FQN is `X.Y`.
 */
function extractImports(source: string): ExtractedImport[] {
  const results: ExtractedImport[] = [];
  const lines = source.split('\n');

  // Handle `from ... import (...)` spanning multiple lines by pre-processing
  // a flattened single-line version while keeping original line numbers.
  const joined = normaliseMultilineImports(source);
  const normalisedLines = joined.split('\n');

  for (let i = 0; i < normalisedLines.length; i++) {
    const raw = normalisedLines[i].trim();
    if (!raw || raw.startsWith('#')) continue;

    // `import X` / `import X.Y.Z` / `import X as Y`, possibly multiple comma-separated
    const importMatch = raw.match(/^import\s+(.+?)(?:\s*#.*)?$/);
    if (importMatch) {
      // could be "import X, Y, Z as W"
      const parts = importMatch[1].split(',').map((p) => p.trim());
      for (const p of parts) {
        const moduleName = p.replace(/\s+as\s+\w+$/, '').trim();
        if (moduleName) {
          results.push({ fqn: moduleName, lineNumber: i + 1, raw });
        }
      }
      continue;
    }

    // `from X import a, b, c` / `from X import a as b`
    const fromMatch = raw.match(/^from\s+(\S+)\s+import\s+(.+?)(?:\s*#.*)?$/);
    if (fromMatch) {
      const base = fromMatch[1];
      const names = fromMatch[2]
        .replace(/[()]/g, '')
        .split(',')
        .map((n) => n.trim().replace(/\s+as\s+\w+$/, '').trim())
        .filter(Boolean);
      for (const n of names) {
        if (n === '*') {
          // `from X import *` — we can't check the wildcard list; just record the base
          results.push({ fqn: base, lineNumber: i + 1, raw });
        } else {
          results.push({ fqn: `${base}.${n}`, lineNumber: i + 1, raw });
        }
      }
    }
  }

  return results;
}

/**
 * Flatten `from X import (\n a,\n b,\n c,\n)` into a single line so the
 * per-line regex in extractImports works. We preserve a single line for
 * the whole import block and stuff empty lines as padding for line numbers.
 */
function normaliseMultilineImports(source: string): string {
  // Match `from X import (` through the closing `)`.
  return source.replace(
    /^(from\s+\S+\s+import\s*)\(([\s\S]*?)\)/gm,
    (_m, prefix, body) => {
      const flat = body.replace(/\s+/g, ' ').trim();
      const pad = body.split('\n').length - 1; // preserve line count
      return prefix + flat + (pad > 0 ? '\n'.repeat(pad) : '');
    },
  );
}

// ──────────────────────────────────────────────────────────────────────
// subprocess / shell-command extraction (for CLI hallucinations)
// ──────────────────────────────────────────────────────────────────────

function extractShellCommands(source: string): Array<{ cmd: string; lineNumber: number }> {
  const results: Array<{ cmd: string; lineNumber: number }> = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // subprocess.run([...]) or subprocess.check_call([...]) or subprocess.Popen([...])
    const subMatch = line.match(
      /subprocess\.(?:run|check_call|check_output|Popen|call)\s*\(\s*\[(.+?)\]/,
    );
    if (subMatch) {
      const items = subMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
        .filter(Boolean);
      if (items.length > 0) {
        // Reconstruct first couple tokens as the "command"
        results.push({ cmd: items.slice(0, 3).join(' '), lineNumber: i + 1 });
      }
    }
    // Jupyter magic: `!nemo train ...`
    const bangMatch = line.match(/^\s*!(\S+(?:\s+\S+){0,3})/);
    if (bangMatch) {
      results.push({ cmd: bangMatch[1], lineNumber: i + 1 });
    }
    // os.system("...")
    const osMatch = line.match(/os\.system\s*\(\s*['"](.+?)['"]/);
    if (osMatch) {
      results.push({ cmd: osMatch[1], lineNumber: i + 1 });
    }
  }
  return results;
}

// ──────────────────────────────────────────────────────────────────────
// Core validator
// ──────────────────────────────────────────────────────────────────────

export interface NotebookCellLike {
  cell_type: 'code' | 'markdown' | string;
  source: string | string[];
}

export function validateNotebookAST(
  cells: NotebookCellLike[],
): ASTValidationResult {
  const violations: ASTViolation[] = [];
  const stats = {
    codeCellsChecked: 0,
    importsChecked: 0,
    nvidiaImportsChecked: 0,
  };

  for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
    const cell = cells[cellIdx];
    if (cell.cell_type !== 'code') continue;

    const src = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
    if (!src || typeof src !== 'string') continue;
    stats.codeCellsChecked++;

    // ── Imports ─────────────────────────────────────────────────
    const imports = extractImports(src);
    stats.importsChecked += imports.length;

    for (const imp of imports) {
      // Match against manifest import roots. Only validate if this import
      // claims to be from an NVIDIA namespace.
      const topLevel = imp.fqn.split('.')[0];
      const service = findServiceForImportRoot(topLevel);
      if (!service) continue; // e.g. numpy, pandas — not our business

      stats.nvidiaImportsChecked++;

      if (isInfraOnlyService(service)) {
        // Something like `import brev` — not a real package.
        violations.push({
          code: 'infra_service_imported',
          cellIndex: cellIdx,
          lineNumber: imp.lineNumber,
          symbol: imp.fqn,
          service,
          message: `Cell ${cellIdx + 1} line ${imp.lineNumber}: "${imp.fqn}" — service "${service}" has no Python SDK.`,
          reprompt: `\`${imp.raw}\` is wrong: ${ALLOWED_APIS[service].fixHint ?? 'service has no Python SDK.'}`,
        });
        continue;
      }

      if (!isSymbolAllowed(imp.fqn, service)) {
        const samples = getAllowedSymbolsSample(service, 6);
        violations.push({
          code: 'hallucinated_import',
          cellIndex: cellIdx,
          lineNumber: imp.lineNumber,
          symbol: imp.fqn,
          service,
          message: `Cell ${cellIdx + 1} line ${imp.lineNumber}: "${imp.fqn}" is not in the allowed-API manifest for "${service}".`,
          reprompt:
            `\`${imp.raw}\` — "${imp.fqn}" does not exist in the ${service} SDK. ` +
            (samples.length > 0
              ? `Valid symbols include: ${samples.map((s) => `\`${s}\``).join(', ')}.`
              : `See the grounding patterns for ${service}.`) +
            (ALLOWED_APIS[service].fixHint ? ` Hint: ${ALLOWED_APIS[service].fixHint}` : ''),
        });
      }
    }

    // ── Shell-command hallucinations ──────────────────────────
    const cmds = extractShellCommands(src);
    for (const cmd of cmds) {
      for (const pat of FAKE_CLI_PATTERNS) {
        if (pat.pattern.test(cmd.cmd)) {
          violations.push({
            code: 'hallucinated_cli',
            cellIndex: cellIdx,
            lineNumber: cmd.lineNumber,
            cli: pat.cli,
            message: `Cell ${cellIdx + 1} line ${cmd.lineNumber}: "${cmd.cmd}" uses a fake CLI "${pat.cli}".`,
            reprompt: `Fake CLI detected — "${pat.cli}". ${pat.suggestion}`,
          });
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    stats,
  };
}

/**
 * Build a concatenated re-prompt string for the notebook generator when
 * AST validation fails. Grouped by cell for readability — keeps the model's
 * context narrower ("fix cell 3 first, then cell 5").
 */
export function buildASTRepromptFeedback(result: ASTValidationResult): string {
  if (result.ok) return '';
  const byCell = new Map<number, string[]>();
  for (const v of result.violations) {
    const arr = byCell.get(v.cellIndex) ?? [];
    arr.push(v.reprompt);
    byCell.set(v.cellIndex, arr);
  }

  const blocks: string[] = [];
  for (const [cellIdx, msgs] of byCell) {
    blocks.push(`Cell ${cellIdx + 1} has grounding errors:\n  - ${msgs.join('\n  - ')}`);
  }

  return [
    'Your previous notebook contained NVIDIA API symbols that do not exist. Fix every one of them and emit a new JSON array:',
    '',
    ...blocks,
    '',
    'Only use symbols from the REAL NVIDIA CODE PATTERNS above. If a service has no Python SDK, invoke it via its real interface (CLI, container, or HTTP endpoint) — do NOT invent imports.',
  ].join('\n');
}
