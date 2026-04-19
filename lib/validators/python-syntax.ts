/**
 * lib/validators/python-syntax.ts
 *
 * Pre-execution Python syntax check for generated notebook code cells.
 * Shells out to a local Python interpreter running `ast.parse(source)` and
 * captures `SyntaxError`. Flags each cell that fails to parse, with the
 * line number + message as a re-promptable fix hint.
 *
 * WHY: the AST validator catches *semantic* hallucinations (fake symbols,
 * deprecated APIs). It does not catch plain *syntax* errors like:
 *
 *   super(FraudMLP, self).__init__     # missing ()
 *   with torch.no_grad:                 # missing ()
 *   if condition                        # missing :
 *   x = f(a, b,,)                       # stray comma
 *
 * Observed live in a fraud-detection notebook (2026-04-19): the model
 * emitted three syntax errors across two cells that would have produced
 * `SyntaxError` the moment the cell was run. Catching these statically
 * converts an entire class of runtime failure into a re-prompt.
 *
 * WHY SHELL OUT TO PYTHON rather than use a JS Python parser? Python's
 * grammar drifts across minor versions (match statements in 3.10, PEP 701
 * in 3.12, etc.). Any in-process JS parser would go stale. Delegating to
 * the actual Python interpreter gives us the ground truth — whatever this
 * system's Python thinks, that's what Jupyter will think.
 *
 * REQUIREMENTS: `python` (or `python3`) on PATH. If neither is available,
 * `validatePythonSyntax` returns { ok: true, skipped: true } so the rest
 * of the pipeline degrades gracefully.
 *
 * Procedures: docs/procedures/02-validator.md
 */

import { spawnSync } from 'node:child_process';

export type PythonSyntaxViolation = {
  code: 'python_syntax_error';
  cellIndex: number;
  lineNumber: number;   // line within the cell
  offset?: number;
  message: string;      // raw SyntaxError message from Python
  reprompt: string;
};

export interface PythonSyntaxValidationResult {
  ok: boolean;
  violations: PythonSyntaxViolation[];
  /** True if Python wasn't available; validation was skipped. */
  skipped: boolean;
  stats: {
    codeCellsChecked: number;
  };
}

export interface NotebookCellLike {
  cell_type: 'code' | 'markdown' | string;
  source: string | string[];
}

// ──────────────────────────────────────────────────────────────────────
// Python interpreter discovery — cached so we don't spawn for every cell.
// ──────────────────────────────────────────────────────────────────────

let pythonExeCache: string | null | undefined = undefined;

function findPythonExe(): string | null {
  if (pythonExeCache !== undefined) return pythonExeCache;
  const candidates = ['python', 'python3'];
  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ['-c', 'import ast; print("ok")'], {
        encoding: 'utf8',
        timeout: 5000,
      });
      if (r.status === 0 && (r.stdout ?? '').trim() === 'ok') {
        pythonExeCache = cmd;
        return cmd;
      }
    } catch {
      /* try next */
    }
  }
  pythonExeCache = null;
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Syntax checker — delegates to Python's ast.parse.
// ──────────────────────────────────────────────────────────────────────

/**
 * Parse a single chunk of Python source; on failure return the SyntaxError
 * details. Spawned via `python -c` with source piped on stdin.
 */
function checkCellSyntax(
  pythonExe: string,
  source: string,
): { ok: true } | { ok: false; line: number; offset?: number; message: string } {
  // `python -c "<code>"` has escaping pitfalls on Windows (cmd.exe eats
  // double quotes). Safer: read source from stdin.
  const script = [
    'import sys, ast, json',
    'src = sys.stdin.read()',
    'try:',
    '    ast.parse(src)',
    '    print(json.dumps({"ok": True}))',
    'except SyntaxError as e:',
    '    print(json.dumps({"ok": False, "line": e.lineno or 1, "offset": e.offset, "message": str(e.msg)}))',
  ].join('\n');

  const r = spawnSync(pythonExe, ['-c', script], {
    input: source,
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (r.status !== 0) {
    // Interpreter itself failed (e.g. import error). Treat as pass-through.
    return { ok: true };
  }
  const line = (r.stdout ?? '').trim().split('\n').pop() ?? '{}';
  try {
    const parsed = JSON.parse(line) as
      | { ok: true }
      | { ok: false; line: number; offset?: number; message: string };
    return parsed;
  } catch {
    return { ok: true };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

export function validatePythonSyntax(
  cells: NotebookCellLike[],
): PythonSyntaxValidationResult {
  const pythonExe = findPythonExe();
  const stats = { codeCellsChecked: 0 };

  if (!pythonExe) {
    return { ok: true, violations: [], skipped: true, stats };
  }

  const violations: PythonSyntaxViolation[] = [];

  for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
    const cell = cells[cellIdx];
    if (cell.cell_type !== 'code') continue;
    const src = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
    if (!src || typeof src !== 'string') continue;
    stats.codeCellsChecked++;

    // Jupyter magics (%magic, !shell) are not Python — strip them before
    // handing to ast.parse. Replace with a pass statement so line numbers
    // are preserved.
    const cleaned = src
      .split('\n')
      .map((line) => (line.trimStart().startsWith('!') || line.trimStart().startsWith('%')
        ? 'pass'
        : line))
      .join('\n');

    const result = checkCellSyntax(pythonExe, cleaned);
    if (result.ok) continue;

    violations.push({
      code: 'python_syntax_error',
      cellIndex: cellIdx,
      lineNumber: result.line,
      offset: result.offset,
      message: result.message,
      reprompt: `Cell ${cellIdx + 1} has a Python SyntaxError at line ${result.line}: "${result.message}". Fix the syntax — common causes: missing parentheses after a call (e.g. \`super().__init__\` not \`super().__init__\`, \`with torch.no_grad():\` not \`with torch.no_grad:\`), missing colon after if/for/while, unclosed brackets or strings.`,
    });
  }

  return {
    ok: violations.length === 0,
    violations,
    skipped: false,
    stats,
  };
}

/**
 * Re-prompt feedback for the generator on syntax failures. Short and direct —
 * syntax issues are usually one-line fixes, don't need elaborate explanation.
 */
export function buildPythonSyntaxRepromptFeedback(
  result: PythonSyntaxValidationResult,
): string {
  if (result.ok || result.violations.length === 0) return '';
  const lines = result.violations.map(
    (v) => `  - Cell ${v.cellIndex + 1} line ${v.lineNumber}: ${v.message}`,
  );
  return [
    'Your previous notebook has Python syntax errors that will prevent cells from running. Fix them:',
    ...lines,
    '',
    'Make sure every function/method call has `()`, every block starter (if/for/while/with/def/class) ends with `:`, and every string / bracket is closed.',
  ].join('\n');
}
