/**
 * scripts/verify-path-validator.ts
 *
 * Runs the Stage 2 path validator against the saved fraud-detailed fixture.
 * Expected: at least 2 violations flagged (Guardrails + Evaluator as LLM-only
 * services in a fraud-detection path). Zero LLM credits spent.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validatePath, buildPathRepromptFeedback } from '../lib/validators/path';
import type { WorkflowStep, GoalSpec } from '../types/ecosystem';

const PATH_FIXTURE = 'fixtures/path/flow-4decb6f7.json';

// Pull the fraud detailed GoalSpec. Use the 2nd fraud fixture (detailed).
// Both fraud fixtures are valid; pick the one whose content mentions the
// detailed-run keywords.
const FRAUD_DETAILED_CANDIDATES = [
  'fixtures/goalspec/planner-c1e35bfd.json',
  'fixtures/goalspec/planner-6a53c2ce.json',
];

function loadFixture(p: string): { content: string } {
  return JSON.parse(readFileSync(path.join(process.cwd(), p), 'utf8'));
}

// Load path fixture
const pathFix = loadFixture(PATH_FIXTURE);
const pathData = JSON.parse(pathFix.content);
const steps: WorkflowStep[] = pathData.steps ?? [];

// Load the fraud detailed spec (pick whichever mentions "50K TPS"-ish scale)
let goalSpec: GoalSpec | null = null;
for (const cand of FRAUD_DETAILED_CANDIDATES) {
  const spec = JSON.parse(loadFixture(cand).content) as GoalSpec;
  const blob = JSON.stringify(spec).toLowerCase();
  if (blob.includes('tps') || blob.includes('kafka') || blob.includes('20 ms')) {
    goalSpec = spec;
    console.log(`Using fraud spec: ${cand}`);
    console.log(`  domain: ${spec.domain}`);
    console.log(`  use_case: ${spec.use_case_type}`);
    break;
  }
}
if (!goalSpec) {
  console.error('Could not locate a fraud detailed GoalSpec fixture.');
  process.exit(1);
}

console.log(`\nPath being validated (${steps.length} steps):`);
steps.forEach((s, i) =>
  console.log(`  ${i + 1}. ${s.serviceId}`),
);

const result = validatePath(steps, goalSpec);
console.log(`\nResult: ok=${result.ok} kind=${result.kind} violations=${result.violations.length}`);
if (result.violations.length > 0) {
  console.log('\nViolations:');
  for (const v of result.violations) {
    console.log(`  [${v.code}] ${v.message}`);
  }
}

const feedback = buildPathRepromptFeedback(result);
if (feedback) {
  console.log('\nRe-prompt feedback (would be appended to user message):');
  console.log('─'.repeat(60));
  console.log(feedback);
  console.log('─'.repeat(60));
}

// Assertions: fraud path should flag at least Guardrails + Evaluator
const llmMisfits = result.violations.filter(
  (v) => v.code === 'llm_service_in_non_llm_path',
);
console.log(`\nLLM-misfit violations: ${llmMisfits.length}`);
const expectedMisfits = ['nemo-guardrails', 'nemo-evaluator'];
const flagged = new Set(llmMisfits.map((v) => v.serviceId));
const missing = expectedMisfits.filter((s) => !flagged.has(s));
if (missing.length > 0) {
  console.error(`FAIL: expected to flag ${expectedMisfits.join(', ')} but missed ${missing.join(', ')}`);
  process.exit(1);
}

console.log('\nPASS — validator caught the known LLM misfits.');
