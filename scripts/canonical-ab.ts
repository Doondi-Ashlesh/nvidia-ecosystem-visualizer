/**
 * scripts/canonical-ab.ts
 *
 * Measurement harness for notebook-generator changes.
 *
 * Usage:
 *   npx tsx scripts/canonical-ab.ts [label]
 *
 * Default label is "fraud-detailed". Reads fixtures/canonical/<label>.json,
 * POSTs the payload to /api/generate-notebook, saves the resulting notebook
 * to fixtures/canonical/runs/<label>-<gitSha>-<timestamp>.ipynb, runs all
 * three validators, appends a row to docs/quality-log.md.
 *
 * WHY: every non-trivial change to the prompt, grounding manifest, or
 * validator should be gated by a measurement here. Otherwise "I improved it"
 * is wishful thinking.
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { validateNotebookAST } from '../lib/validators/notebook-ast';
import { validateNarrative } from '../lib/validators/narrative';
import { validatePythonSyntax } from '../lib/validators/python-syntax';
import type { WorkflowStep } from '../types/ecosystem';

interface NotebookCellLike {
  cell_type: 'code' | 'markdown' | string;
  source: string | string[];
}

const label = process.argv[2] ?? 'fraud-detailed';
const payloadPath = `fixtures/canonical/${label}.json`;
if (!existsSync(payloadPath)) {
  console.error(`Canonical payload not found: ${payloadPath}`);
  console.error(`Run: npx tsx scripts/build-canonical-payload.ts`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
const steps: WorkflowStep[] = payload.steps;

function currentSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'nosha';
  }
}

function currentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'nobranch';
  }
}

async function runGeneration(): Promise<{ body: string; latencyMs: number; status: number }> {
  const t0 = Date.now();
  const res = await fetch('http://localhost:3000/api/generate-notebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal: payload.goal, steps: payload.steps, goalSpec: payload.goalSpec }),
    // No explicit timeout — NIM 504 gateway is ~15 min; let the server retry
    // and report honestly.
  });
  const latencyMs = Date.now() - t0;
  const body = await res.text();
  return { body, latencyMs, status: res.status };
}

async function main() {
  console.log(`\n=== Canonical A/B: ${label} ===`);
  console.log(`Branch:   ${currentBranch()}`);
  console.log(`Commit:   ${currentSha()}`);
  console.log(`Payload:  ${payloadPath}`);
  console.log(`Steps:    ${steps.map((s) => s.serviceId).join(' → ')}`);
  console.log('');
  console.log('POSTing to /api/generate-notebook …');

  const { body, latencyMs, status } = await runGeneration();

  console.log(`Response: HTTP ${status} in ${(latencyMs / 1000).toFixed(1)}s`);

  if (status !== 200) {
    console.error('Generation failed. Response body:');
    console.error(body.slice(0, 500));
    process.exit(1);
  }

  // Parse the returned notebook
  let notebook: { cells?: NotebookCellLike[] };
  try {
    notebook = JSON.parse(body);
  } catch {
    console.error('Response was not valid JSON. First 500 chars:');
    console.error(body.slice(0, 500));
    process.exit(1);
  }
  const cells = notebook.cells ?? [];

  // Save the notebook to a versioned path
  mkdirSync('fixtures/canonical/runs', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = `fixtures/canonical/runs/${label}-${currentSha()}-${stamp}.ipynb`;
  writeFileSync(outPath, JSON.stringify(notebook, null, 2), 'utf8');
  console.log(`Saved notebook: ${outPath}`);

  // Validators
  console.log('\n--- AST validator ---');
  const ast = validateNotebookAST(cells);
  console.log(`code-cells=${ast.stats.codeCellsChecked} imports=${ast.stats.importsChecked} nvidia=${ast.stats.nvidiaImportsChecked} violations=${ast.violations.length}`);
  const astByCode = new Map<string, number>();
  for (const v of ast.violations) astByCode.set(v.code, (astByCode.get(v.code) ?? 0) + 1);
  for (const [c, n] of astByCode) console.log(`  ${c}: ${n}`);

  console.log('\n--- Python syntax validator ---');
  const syn = validatePythonSyntax(cells);
  console.log(`code-cells=${syn.stats.codeCellsChecked} skipped=${syn.skipped} violations=${syn.violations.length}`);
  for (const v of syn.violations.slice(0, 5)) console.log(`  cell ${v.cellIndex + 1}: ${v.message}`);

  console.log('\n--- Narrative validator ---');
  const narr = validateNarrative(cells, steps);
  console.log(`found=[${narr.sectionsFound.join(',')}] missing=${narr.violations.length}`);
  for (const v of narr.violations) console.log(`  missing: ${v.section}`);

  // Composite score — crude but useful for trend tracking.
  const totalViolations = ast.violations.length + syn.violations.length + narr.violations.length;
  const knownFakes = ast.violations.filter((v) => v.code === 'known_fake_symbol').length;
  const deprecated = ast.violations.filter((v) => v.code === 'deprecated_api').length;
  const hallucinated = ast.violations.filter((v) => v.code === 'hallucinated_import').length;

  console.log('\n=== Summary ===');
  console.log(`Total violations: ${totalViolations}`);
  console.log(`  known-fake symbols:     ${knownFakes}`);
  console.log(`  deprecated APIs:        ${deprecated}`);
  console.log(`  hallucinated imports:   ${hallucinated}`);
  console.log(`  python syntax errors:   ${syn.violations.length}`);
  console.log(`  narrative sections missing: ${narr.violations.length}`);

  // Append to quality log
  const logLine = `| ${stamp} | ${label} | ${currentBranch()} | ${currentSha()} | ${(latencyMs/1000).toFixed(0)}s | ${cells.length} | ${totalViolations} | ${knownFakes} | ${deprecated} | ${hallucinated} | ${syn.violations.length} | ${narr.violations.length} | [${path.basename(outPath)}](../${outPath}) |`;
  const logPath = 'docs/quality-log.md';
  if (!existsSync(logPath)) {
    const header = [
      '# Notebook Generator Quality Log',
      '',
      'Append-only record of canonical A/B runs. Each row is one run of `scripts/canonical-ab.ts` on a canonical fixture.',
      '',
      '| Timestamp | Case | Branch | Commit | Latency | Cells | Total violations | Known-fake | Deprecated | Hallucinated | Syntax | Narrative missing | Notebook |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
      '',
    ].join('\n');
    mkdirSync('docs', { recursive: true });
    writeFileSync(logPath, header, 'utf8');
  }
  appendFileSync(logPath, logLine + '\n', 'utf8');
  console.log(`\nAppended row to ${logPath}`);
}

main().catch((err) => {
  console.error('Harness failed:', err);
  process.exit(1);
});
