/**
 * scripts/verify-normalize.ts
 *
 * Replay the 3 fixtures that failed zod validation, run them through the
 * patched normalizeSpec + GoalSpecSchema, and confirm they now pass.
 *
 * Zero LLM calls — everything runs from saved JSON.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GoalSpecSchema, zodErrorsToStrings } from '../lib/schemas';
import type { GoalSpec } from '../types/ecosystem';

// Copy of normalizeSpec (kept in sync with route file manually — short-lived).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSpec(spec: any): GoalSpec {
  const s = spec;
  s.inferred_requirements ??= [];
  s.gaps ??= [];
  s.conflicts ??= [];
  s.performance_goals ??= [];
  s.constraints ??= { compliance: [], hardware: '', scale: '', other: [] };
  s.constraints.compliance ??= [];
  s.constraints.other ??= [];

  const coerceScalar = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join('; ');
    return '';
  };
  s.constraints.hardware = coerceScalar(s.constraints.hardware);
  s.constraints.scale = coerceScalar(s.constraints.scale);

  const coerceStringArray = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => (typeof x === 'string' ? x : '')).filter((x) => x.length > 0);
  };
  s.constraints.compliance = coerceStringArray(s.constraints.compliance);
  s.constraints.other = coerceStringArray(s.constraints.other);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nonEmpty = (v: any): boolean => typeof v === 'string' && v.trim().length > 0;

  s.performance_goals = s.performance_goals.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g: any) => nonEmpty(g?.metric) && nonEmpty(g?.target) && nonEmpty(g?.rationale),
  );
  s.inferred_requirements = s.inferred_requirements.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => nonEmpty(r?.requirement) && nonEmpty(r?.reason),
  );
  s.gaps = s.gaps.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g: any) => nonEmpty(g?.gap) && nonEmpty(g?.suggestion),
  );
  s.conflicts = s.conflicts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => {
      const sev = typeof c?.severity === 'string' ? c.severity.toLowerCase().trim() : '';
      const normSev =
        sev === 'blocking' || sev === 'critical' || sev === 'major'
          ? 'blocking'
          : 'warning';
      return { ...c, severity: normSev };
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((c: any) => nonEmpty(c?.conflict) && nonEmpty(c?.suggestion));

  return s as GoalSpec;
}

const ROOT = path.join(process.cwd(), 'fixtures', 'goalspec');
// Fixture IDs that failed in the first run, from the test log:
// recommendation/vague    = planner-01e94726 (empty conflict placeholder)
// recommendation/detailed = planner-b0eacf8c (hardware/scale as array)
// speech/detailed         = planner-557e19b6 (gap with wrong field names)
const targets = [
  { id: 'planner-01e94726', label: 'recommendation/vague — empty conflict row' },
  { id: 'planner-b0eacf8c', label: 'recommendation/detailed — hardware as array' },
  { id: 'planner-557e19b6', label: 'speech/detailed — malformed gap entry' },
];

let allOk = true;
for (const t of targets) {
  const raw = readFileSync(path.join(ROOT, t.id + '.json'), 'utf8');
  const fixture = JSON.parse(raw) as { content: string };
  const spec = JSON.parse(fixture.content);
  const normalised = normalizeSpec(spec);
  const check = GoalSpecSchema.safeParse(normalised);
  if (check.success) {
    const data = check.data;
    console.log(
      `PASS  ${t.label.padEnd(55)}  perf=${data.performance_goals.length} inf=${data.inferred_requirements.length} gaps=${data.gaps.length} conflicts=${data.conflicts.length}`,
    );
  } else {
    allOk = false;
    console.log(`FAIL  ${t.label}`);
    console.log('  issues:', zodErrorsToStrings(check.error).join('\n         '));
  }
}

console.log(`\n${allOk ? 'All 3 formerly-failing fixtures now pass.' : 'Still broken — see issues above.'}`);
process.exit(allOk ? 0 : 1);
