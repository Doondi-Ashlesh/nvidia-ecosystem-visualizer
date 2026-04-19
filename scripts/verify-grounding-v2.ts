/**
 * scripts/verify-grounding-v2.ts
 *
 * Offline verification that the extended AST validator (known-fake symbols
 * + deprecated-API detection) catches the hallucinations I hand-identified
 * in the live-generated fraud-detection notebook from 2026-04-19.
 *
 * Expected catches:
 *   - cuml.neural_network.MLPClassifier (known fake, 2 cell occurrences)
 *   - tensorrt.nvinfer1 (known fake)
 *   - builder.max_workspace_size (deprecated)
 *   - builder.fp16_mode (deprecated)
 *   - builder.int8_mode (deprecated)
 *   - builder.build_cuda_engine (deprecated)
 *   - engine.max_batch_size (deprecated)
 *   - engine.binding_is_input (deprecated)
 *   - engine.get_binding_shape (deprecated)
 *   - context.execute_async (deprecated)
 */

import { readFileSync } from 'node:fs';
import {
  validateNotebookAST,
  buildASTRepromptFeedback,
  type NotebookCellLike,
} from '../lib/validators/notebook-ast';

const NOTEBOOK =
  process.argv[2] ?? 'C:/Users/THUNDER/Downloads/nvidia-pipeline-ai-1776632037968.ipynb';

const raw = readFileSync(NOTEBOOK, 'utf8');
const nb = JSON.parse(raw) as { cells?: NotebookCellLike[] };
const cells = nb.cells ?? [];

console.log(`Notebook: ${NOTEBOOK}`);
console.log(`Total cells: ${cells.length}\n`);

const result = validateNotebookAST(cells);

console.log('=== Stats ===');
console.log(result.stats);

console.log('\n=== Violations (by type) ===');
const byCode = new Map<string, number>();
for (const v of result.violations) byCode.set(v.code, (byCode.get(v.code) ?? 0) + 1);
for (const [code, n] of byCode) console.log(`  ${code}: ${n}`);

console.log('\n=== Violation detail ===');
for (const v of result.violations) {
  console.log(`  [${v.code}] ${v.message}`);
}

console.log('\n=== Sample reprompt feedback (first 2000 chars) ===');
console.log(buildASTRepromptFeedback(result).slice(0, 2000));
