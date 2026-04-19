/**
 * scripts/build-canonical-payload.ts
 *
 * Builds a canonical notebook-generation payload from saved GoalSpec +
 * path fixtures. The output is deterministic: committed to the repo,
 * every canonical-AB run uses the exact same input. Run once (or when
 * upgrading the input); subsequent test runs just POST this payload.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { GoalSpec, WorkflowStep } from '../types/ecosystem';

interface Manifest {
  /** Label for this canonical case. Shows up in the quality log. */
  label: string;
  /** Human-readable description of what this tests. */
  description: string;
  /** Path fixture to derive steps from (just the serviceIds + inputs/outputs). */
  pathFixture: string;
  /** GoalSpec fixture to derive the spec from. */
  goalspecFixture: string;
  /** User-facing goal string (shown in UI, included in prompt). */
  goal: string;
}

const CANONICALS: Manifest[] = [
  {
    label: 'fraud-detailed',
    description:
      'Real-time credit-card fraud detection at 50K TPS. Exercises: tabular-ML path (no LLM services), TensorRT + Triton serving stack, compliance (PCI DSS + SOC2), numeric latency budgets.',
    pathFixture: 'fixtures/path/flow-4decb6f7.json',
    goalspecFixture: 'fixtures/goalspec/planner-c1e35bfd.json',
    goal: 'Real-time credit card fraud detection at 50K TPS, <20ms p99 decision latency, integrate with Kafka event stream, SOC2 compliance, use graph features, deploy on A100 GPUs, explainability for declined transactions, weekly retraining on last 90 days of data.',
  },
];

function loadFixtureContent(relPath: string): unknown {
  const raw = readFileSync(path.join(process.cwd(), relPath), 'utf8');
  const parsed = JSON.parse(raw) as { content: string };
  return JSON.parse(parsed.content);
}

function normaliseSpec(spec: GoalSpec): GoalSpec {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = spec as any;
  s.inferred_requirements ??= [];
  s.gaps ??= [];
  s.conflicts ??= [];
  s.performance_goals ??= [];
  s.constraints ??= { compliance: [], hardware: '', scale: '', other: [] };
  s.constraints.compliance ??= [];
  s.constraints.other ??= [];
  const coerce = (v: unknown): string =>
    typeof v === 'string' ? v : Array.isArray(v) ? v.filter((x) => typeof x === 'string').join('; ') : '';
  s.constraints.hardware = coerce(s.constraints.hardware);
  s.constraints.scale = coerce(s.constraints.scale);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nonEmpty = (v: any) => typeof v === 'string' && v.trim().length > 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.performance_goals = s.performance_goals.filter((g: any) => nonEmpty(g?.metric) && nonEmpty(g?.target) && nonEmpty(g?.rationale));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.inferred_requirements = s.inferred_requirements.filter((r: any) => nonEmpty(r?.requirement) && nonEmpty(r?.reason));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.gaps = s.gaps.filter((g: any) => nonEmpty(g?.gap) && nonEmpty(g?.suggestion));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.conflicts = s.conflicts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => ({ ...c, severity: c?.severity === 'blocking' ? 'blocking' : 'warning' }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((c: any) => nonEmpty(c?.conflict) && nonEmpty(c?.suggestion));
  return s as GoalSpec;
}

for (const canon of CANONICALS) {
  const goalspec = normaliseSpec(loadFixtureContent(canon.goalspecFixture) as GoalSpec);
  const pathData = loadFixtureContent(canon.pathFixture) as { steps?: WorkflowStep[] };
  let steps: WorkflowStep[] = pathData.steps ?? [];

  // Strip LLM-only services from the canonical path so we're testing the
  // notebook generator, not the path validator. This gives Stage 3 a clean
  // input every time and the canonical is stable against prompt drift in
  // earlier stages.
  const LLM_ONLY = new Set([
    'nemo-guardrails',
    'nemo-evaluator',
    'nemo-retriever',
    'tensorrt-llm',
    'megatron-lm',
    'nemo-gym',
    'nemotron',
    'nemo-curator',
    'blueprints',
  ]);
  steps = steps.filter((s) => !LLM_ONLY.has(s.serviceId)).slice(0, 7);

  const payload = {
    canonicalLabel: canon.label,
    description: canon.description,
    goal: canon.goal,
    goalSpec: goalspec,
    steps,
  };

  mkdirSync('fixtures/canonical', { recursive: true });
  const out = `fixtures/canonical/${canon.label}.json`;
  writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Wrote ${out}`);
  console.log(`  goal:       ${canon.goal.slice(0, 60)}…`);
  console.log(`  goalSpec:   ${goalspec.domain} / perf=${goalspec.performance_goals.length} compl=${goalspec.constraints.compliance.length}`);
  console.log(`  steps:      ${steps.map((s) => s.serviceId).join(' → ')}`);
}
