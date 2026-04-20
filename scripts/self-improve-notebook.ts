/**
 * scripts/self-improve-notebook.ts
 *
 * Self-improvement loop: execute a notebook, classify failures, fix the
 * root causes via /api/fix-notebook-cell, patch, re-execute. Repeat up
 * to N iterations or until all cells pass.
 *
 * Usage:
 *   npx tsx scripts/self-improve-notebook.ts <input.ipynb> [serviceIds=a,b,c] [maxIters=3]
 *
 * Writes:
 *   <input>.iter1.ipynb, <input>.iter2.ipynb, …  — post-execute copies
 *   <input>.final.ipynb                          — last iteration's result
 *   <input>.trajectory.json                      — per-iteration metrics
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';
import {
  classifyFailures,
  rootCausesOnly,
  type ExecutionReport,
} from '../lib/execution-report';

// Disable client fetch timeouts — fix-pass can take a few minutes per call.
setGlobalDispatcher(
  new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 30_000 }),
);

// ──────────────────────────────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────────────────────────────

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('usage: self-improve-notebook.ts <input.ipynb> [--services=a,b,c] [--max=3]');
  process.exit(1);
}

const argMap = new Map<string, string>();
for (const a of process.argv.slice(3)) {
  const m = a.match(/^--(\w+)=(.*)$/);
  if (m) argMap.set(m[1], m[2]);
}
const serviceIds = (argMap.get('services') ?? 'rapids,tensorrt,model-optimizer,triton,ai-enterprise,ai-workbench').split(',');
const maxIters = parseInt(argMap.get('max') ?? '3', 10);
const goal = argMap.get('goal') ?? '';

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

interface NotebookCell {
  cell_type: 'code' | 'markdown' | string;
  source: string | string[];
  outputs?: unknown[];
  execution_count?: number | null;
  metadata?: Record<string, unknown>;
}
interface Notebook {
  cells: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
}

function readNotebook(p: string): Notebook {
  return JSON.parse(readFileSync(p, 'utf8')) as Notebook;
}
function writeNotebook(p: string, nb: Notebook): void {
  writeFileSync(p, JSON.stringify(nb, null, 2), 'utf8');
}

function cellSourceStr(c: NotebookCell): string {
  return Array.isArray(c.source) ? c.source.join('') : (c.source as string);
}

/**
 * Run scripts/execute-notebook.py and parse the last JSON line from stdout.
 * Python may emit subprocess noise (pip install output, warnings) on stdout
 * before the report line — we extract the last line starting with '{'.
 */
function runExecutor(inp: string, outp: string): ExecutionReport {
  const result = spawnSync(
    'python',
    ['scripts/execute-notebook.py', inp, outp],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60_000 },
  );
  const combined = (result.stdout ?? '') + '\n' + (result.stderr ?? '');
  const lines = combined.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith('{"cells":') || line.startsWith('{ "cells":')) {
      try {
        return JSON.parse(line) as ExecutionReport;
      } catch {
        /* try next */
      }
    }
  }
  throw new Error(`Executor produced no parseable report. Exit=${result.status}. Last 500 chars: ${combined.slice(-500)}`);
}

/**
 * POST to /api/fix-notebook-cell with one cell's error + context.
 * Returns the fixed source (just the code, no fences).
 */
async function fixCell(args: {
  cellSource: string;
  errorName: string;
  errorMessage: string;
  errorTraceback: string[];
  serviceIds: string[];
  goal: string;
  priorCellsSummary: string;
  variablesInScope: string[];
}): Promise<{ fixedSource: string; notes: string }> {
  const res = await fetch('http://localhost:3000/api/fix-notebook-cell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cellSource: args.cellSource,
      errorName: args.errorName,
      errorMessage: args.errorMessage,
      errorTraceback: args.errorTraceback,
      serviceIds: args.serviceIds,
      goal: args.goal,
      context: {
        priorCellsSummary: args.priorCellsSummary,
        variablesInScope: args.variablesInScope,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fix-notebook-cell HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as { fixedSource: string; notes?: string };
  return { fixedSource: data.fixedSource, notes: data.notes ?? '' };
}

/**
 * Best-effort summary of variables assigned by successful cells so far —
 * fed as context to the fix-pass so it doesn't "reinvent" them.
 */
function collectVariablesFromOkCells(nb: Notebook, exec: ExecutionReport): string[] {
  const ok = new Set<number>();
  for (const c of exec.cells) if (c.type === 'code' && c.status === 'ok') ok.add(c.index);
  const vars = new Set<string>();
  for (const idx of ok) {
    const src = cellSourceStr(nb.cells[idx]);
    for (const line of src.split('\n')) {
      const m = line.match(/^([a-zA-Z_]\w*)\s*=(?!=)/);
      if (m) vars.add(m[1]);
    }
  }
  return Array.from(vars).slice(0, 30);
}

function summarisePriorCells(nb: Notebook, idx: number): string {
  return nb.cells
    .slice(0, idx)
    .filter((c) => c.cell_type === 'code')
    .map((c, i) => {
      const src = cellSourceStr(c);
      const first = src.split('\n').find((l) => l.trim() && !l.trim().startsWith('#')) ?? '';
      return `  cell ${i + 1}: ${first.slice(0, 80)}`;
    })
    .join('\n');
}

// ──────────────────────────────────────────────────────────────────────
// Main loop
// ──────────────────────────────────────────────────────────────────────

interface IterationRecord {
  iteration: number;
  totalCells: number;
  codeOk: number;
  codeError: number;
  rootCauses: number;
  cascades: number;
  rootCauseCells: number[];
  notebookPath: string;
  latencyMs: number;
}

async function main(): Promise<void> {
  const trajectory: IterationRecord[] = [];
  let current = readNotebook(inputPath);
  let currentPath = inputPath;

  console.log(`\n=== self-improve-notebook ===`);
  console.log(`Input:      ${inputPath}`);
  console.log(`Services:   ${serviceIds.join(', ')}`);
  console.log(`Max iters:  ${maxIters}`);
  console.log('');

  for (let iter = 1; iter <= maxIters; iter++) {
    console.log(`── Iteration ${iter} ────────────────────────────────────`);

    const t0 = Date.now();
    const execOut = `${inputPath}.iter${iter}.ipynb`;
    writeNotebook(execOut, current);
    console.log(`Executing ${execOut} …`);

    let report: ExecutionReport;
    try {
      report = runExecutor(execOut, execOut);
    } catch (err) {
      console.error(`Executor failed: ${err instanceof Error ? err.message : err}`);
      break;
    }
    const execMs = Date.now() - t0;

    console.log(`  summary: ${JSON.stringify(report.summary)}`);

    const sources = current.cells.map(cellSourceStr);
    const failures = classifyFailures(report, sources);
    const roots = rootCausesOnly(failures);

    trajectory.push({
      iteration: iter,
      totalCells: report.summary.total,
      codeOk: report.summary.code_ok,
      codeError: report.summary.code_error,
      rootCauses: roots.length,
      cascades: failures.length - roots.length,
      rootCauseCells: roots.map((f) => f.cellIndex),
      notebookPath: execOut,
      latencyMs: execMs,
    });

    if (report.summary.code_error === 0) {
      console.log(`  ✅ all code cells pass.`);
      break;
    }

    console.log(`  failures: ${failures.length} (root=${roots.length}, cascade=${failures.length - roots.length})`);
    for (const r of roots) {
      console.log(`    🔴 cell ${r.cellIndex + 1}: ${r.errorName}: ${r.errorMessage.slice(0, 80)}`);
    }

    if (roots.length === 0) {
      console.log(`  no root causes to fix — stopping.`);
      break;
    }

    // Fix each root cause
    const varsInScope = collectVariablesFromOkCells(current, report);
    const patched: Notebook = { ...current, cells: current.cells.map((c) => ({ ...c })) };

    for (const root of roots) {
      const cell = patched.cells[root.cellIndex];
      const src = cellSourceStr(cell);
      console.log(`  fixing cell ${root.cellIndex + 1} …`);
      try {
        const { fixedSource, notes } = await fixCell({
          cellSource: src,
          errorName: root.errorName,
          errorMessage: root.errorMessage,
          errorTraceback: report.cells[root.cellIndex].error?.traceback ?? [],
          serviceIds,
          goal,
          priorCellsSummary: summarisePriorCells(current, root.cellIndex),
          variablesInScope: varsInScope,
        });
        patched.cells[root.cellIndex] = {
          ...cell,
          source: fixedSource,
          execution_count: null,
          outputs: [],
        };
        if (notes) console.log(`    notes: ${notes.slice(0, 120)}`);
        console.log(`    fixed (${fixedSource.length}ch)`);
      } catch (err) {
        console.error(`    fix failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    current = patched;
    currentPath = `${inputPath}.iter${iter}.patched.ipynb`;
    writeNotebook(currentPath, current);
    console.log(`  patched notebook saved: ${currentPath}`);
  }

  // Final save
  const finalPath = `${inputPath}.final.ipynb`;
  writeNotebook(finalPath, current);
  writeFileSync(`${inputPath}.trajectory.json`, JSON.stringify(trajectory, null, 2), 'utf8');

  console.log('\n=== Trajectory ===');
  for (const r of trajectory) {
    console.log(`  iter ${r.iteration}: ok=${r.codeOk}/${r.codeOk + r.codeError} roots=${r.rootCauses} cascades=${r.cascades} (${(r.latencyMs / 1000).toFixed(1)}s)`);
  }

  const last = trajectory[trajectory.length - 1];
  if (last && last.codeError === 0) {
    console.log('\n🎯 Converged: all code cells pass.');
  } else if (last) {
    console.log(`\n⚠ Stopped with ${last.codeError} code cells still failing.`);
  }
  console.log(`Final notebook:   ${finalPath}`);
  console.log(`Trajectory log:   ${inputPath}.trajectory.json`);
}

main().catch((err) => {
  console.error('orchestrator failed:', err);
  process.exit(1);
});
