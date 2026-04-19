/**
 * scripts/verify-narrative.ts
 *
 * Run the narrative-structure validator against saved notebooks. Zero LLM
 * credits — just heading-pattern matching on static files.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validateNarrative,
  buildNarrativeRepromptFeedback,
  type NarrativeCell,
} from '../lib/validators/narrative';
import type { WorkflowStep } from '../types/ecosystem';

// Mock "training" path so baseline is required.
const stepsWithTraining: WorkflowStep[] = [
  { serviceId: 'nemo-curator', role: 'data prep', action: 'x' },
  { serviceId: 'nemo', role: 'train', action: 'x' },
  { serviceId: 'triton', role: 'serve', action: 'x' },
];

const NOTEBOOKS = [
  'docs/nvidia-fraud-detection-pipeline.ipynb',
  'docs/nvidia-pipeline-ai-1776047026232.ipynb',
];

for (const nbPath of NOTEBOOKS) {
  console.log('\n─'.repeat(72));
  console.log(`NOTEBOOK: ${nbPath}`);
  console.log('─'.repeat(72));
  let cells: NarrativeCell[];
  try {
    const abs = path.join(process.cwd(), nbPath);
    const raw = readFileSync(abs, 'utf8');
    cells = (JSON.parse(raw) as { cells?: NarrativeCell[] }).cells ?? [];
  } catch (err) {
    console.log(`SKIP: ${err instanceof Error ? err.message : err}`);
    continue;
  }

  const result = validateNarrative(cells, stepsWithTraining);

  console.log(`Required sections: ${result.sectionsRequired.join(', ')}`);
  console.log(`Found sections:    ${result.sectionsFound.join(', ') || '(none)'}`);
  console.log(`Violations: ${result.violations.length}`);
  if (!result.ok) {
    console.log('\nMissing sections reprompt:');
    console.log(buildNarrativeRepromptFeedback(result));
  } else {
    console.log('PASS — all required narrative sections present.');
  }
}
