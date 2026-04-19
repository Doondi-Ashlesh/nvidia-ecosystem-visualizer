import { readFileSync } from 'node:fs';
import { validatePath, isLLMUseCase, hasStrongNonLLMSignal } from '../lib/validators/path';
import type { GoalSpec, WorkflowStep } from '../types/ecosystem';

const fix = JSON.parse(readFileSync('fixtures/path/flow-61507adc.json', 'utf8'));
const steps: WorkflowStep[] = JSON.parse(fix.content).steps;

// Approximate the fraud GoalSpec from what UI showed
const goalSpec: GoalSpec = {
  domain: 'Financial Services / Banking Fraud Detection',
  use_case_type: 'Real-time transaction fraud scoring',
  summary:
    'The refined goal is to build a real‑time fraud detection system for bank transactions that achieves at least 90% recall and an F1‑score of 0.88 or higher, scores each transaction within a 20 ms 99th‑percentile latency budget',
  performance_goals: [],
  constraints: { compliance: ['PCI DSS'], hardware: '', scale: '', other: [] },
  // This ONE inferred requirement — verbatim from the live UI — was triggering
  // the 'prompt' substring match inside the word 'promotion'. Bug reproducer.
  inferred_requirements: [
    { requirement: 'Model version registry and promotion pipeline', reason: 'mlops hygiene' },
  ],
  gaps: [],
  conflicts: [],
};

console.log('isLLMUseCase:', isLLMUseCase(goalSpec));
console.log('hasStrongNonLLMSignal:', hasStrongNonLLMSignal(goalSpec));
console.log('');

const result = validatePath(steps, goalSpec);
console.log('kind:', result.kind);
console.log('violations count:', result.violations.length);
for (const v of result.violations) {
  console.log(`  [${v.code}] svc=${(v as {serviceId?:string}).serviceId ?? '-'} — ${v.message}`);
}
