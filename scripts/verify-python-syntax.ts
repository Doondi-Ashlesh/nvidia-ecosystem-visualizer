import { readFileSync } from 'node:fs';
import {
  validatePythonSyntax,
  buildPythonSyntaxRepromptFeedback,
  type NotebookCellLike,
} from '../lib/validators/python-syntax';

const NOTEBOOK =
  process.argv[2] ?? 'C:/Users/THUNDER/Downloads/nvidia-pipeline-ai-1776632037968.ipynb';

const nb = JSON.parse(readFileSync(NOTEBOOK, 'utf8')) as { cells?: NotebookCellLike[] };
const cells = nb.cells ?? [];

const result = validatePythonSyntax(cells);

console.log(`Notebook: ${NOTEBOOK}`);
console.log(`Python skipped: ${result.skipped}`);
console.log(`Stats: ${JSON.stringify(result.stats)}`);
console.log(`Violations: ${result.violations.length}`);

for (const v of result.violations) {
  console.log(`  cell ${v.cellIndex + 1} line ${v.lineNumber}: ${v.message}`);
}

if (!result.ok) {
  console.log('\n=== Re-prompt feedback ===');
  console.log(buildPythonSyntaxRepromptFeedback(result));
}
