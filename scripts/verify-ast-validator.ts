/**
 * scripts/verify-ast-validator.ts
 *
 * Offline verification: runs the AST validator against previously-generated
 * notebook fixtures (docs/nvidia-*.ipynb). Reports every hallucinated
 * symbol + fake CLI it catches — which is the baseline hallucination rate
 * the validator would have closed before it existed.
 *
 * Zero LLM credits spent.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validateNotebookAST,
  buildASTRepromptFeedback,
  type NotebookCellLike,
} from '../lib/validators/notebook-ast';

const NOTEBOOKS = [
  'docs/nvidia-fraud-detection-pipeline.ipynb',
  'docs/nvidia-pipeline-ai-1776047026232.ipynb',
];

function loadNotebook(relPath: string): NotebookCellLike[] {
  const abs = path.join(process.cwd(), relPath);
  const raw = readFileSync(abs, 'utf8');
  const nb = JSON.parse(raw) as { cells?: NotebookCellLike[] };
  return nb.cells ?? [];
}

let totalViolations = 0;

for (const nbPath of NOTEBOOKS) {
  console.log('\n─'.repeat(72));
  console.log(`NOTEBOOK: ${nbPath}`);
  console.log('─'.repeat(72));

  let cells: NotebookCellLike[];
  try {
    cells = loadNotebook(nbPath);
  } catch (err) {
    console.log(`  SKIP — could not load: ${err instanceof Error ? err.message : err}`);
    continue;
  }

  const result = validateNotebookAST(cells);
  totalViolations += result.violations.length;

  console.log(
    `Stats: code-cells=${result.stats.codeCellsChecked} imports=${result.stats.importsChecked} nvidia-imports=${result.stats.nvidiaImportsChecked}`,
  );
  console.log(`Violations: ${result.violations.length}`);

  if (result.violations.length > 0) {
    console.log('');
    const byCode = new Map<string, number>();
    for (const v of result.violations) {
      byCode.set(v.code, (byCode.get(v.code) ?? 0) + 1);
    }
    console.log(`By type: ${[...byCode].map(([c, n]) => `${c}=${n}`).join(', ')}`);

    console.log('\nSamples:');
    for (const v of result.violations.slice(0, 8)) {
      console.log(`  [${v.code}] ${v.message}`);
    }

    console.log('\n--- Reprompt feedback ---');
    console.log(buildASTRepromptFeedback(result).slice(0, 1500));
    console.log('--- end feedback ---');
  }
}

console.log('\n' + '='.repeat(72));
console.log(`TOTAL violations across ${NOTEBOOKS.length} notebooks: ${totalViolations}`);
console.log('='.repeat(72));
