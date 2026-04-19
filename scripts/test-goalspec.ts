/**
 * scripts/test-goalspec.ts
 *
 * Quality smoke-test for /api/analyze-requirements across domains.
 *
 * Runs 10 cases (5 domains × vague + detailed). Uses DRAFT mode by default
 * (1 LLM call per case, no adversary loop) to keep credits cheap while still
 * exercising the planner prompt and schema. If the draft quality is poor,
 * the adversary loop won't fix it — so this is the right gate.
 *
 * Usage:
 *   LLM_SAVE_FIXTURES=1 npx tsx scripts/test-goalspec.ts
 *   # or with full adversary loop:
 *   FULL=1 LLM_SAVE_FIXTURES=1 npx tsx scripts/test-goalspec.ts
 *
 * Emits a markdown table + per-case detail report to stdout, and writes JSON
 * to docs/test-results/goalspec-<timestamp>.json.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

type CaseKind = 'vague' | 'detailed';

interface TestCase {
  domain: string;
  kind: CaseKind;
  input: string;
  /** Substring keywords we expect to see in domain/compliance/goals */
  expectCompliance?: string[];
  /** For vague cases, we expect inferred requirements to fill the gap */
  minInferred?: number;
  /** For detailed cases, we expect many performance goals with numeric targets */
  minPerfGoals?: number;
}

const CASES: TestCase[] = [
  // ── Healthcare ────────────────────────────────────────────────────────
  {
    domain: 'healthcare',
    kind: 'vague',
    input: 'help doctors make better decisions at hospitals',
    expectCompliance: ['HIPAA'],
    minInferred: 2,
  },
  {
    domain: 'healthcare',
    kind: 'detailed',
    input:
      'Build a HIPAA-compliant clinical decision support system for a 500-bed hospital. ' +
      'Process EHR data, integrate with Epic via HL7 FHIR, provide triage recommendations ' +
      'with <500ms p95 latency, support 10K queries/day, include audit logs, de-identify all training data.',
    expectCompliance: ['HIPAA'],
    minPerfGoals: 4,
  },

  // ── Fraud detection ───────────────────────────────────────────────────
  {
    domain: 'fraud',
    kind: 'vague',
    input: 'catch fraud in bank transactions',
    expectCompliance: ['PCI', 'SOC'],
    minInferred: 2,
  },
  {
    domain: 'fraud',
    kind: 'detailed',
    input:
      'Real-time credit card fraud detection at 50K TPS, <20ms p99 decision latency, ' +
      'integrate with Kafka event stream, SOC2 compliance, use graph features, deploy on A100 GPUs, ' +
      'explainability for declined transactions, weekly retraining on last 90 days of data.',
    expectCompliance: ['SOC2', 'PCI'],
    minPerfGoals: 4,
  },

  // ── Recommendation / retail ───────────────────────────────────────────
  {
    domain: 'recommendation',
    kind: 'vague',
    input: 'suggest products to shoppers',
    minInferred: 2,
  },
  {
    domain: 'recommendation',
    kind: 'detailed',
    input:
      'E-commerce recommendation engine for 5M-SKU catalog, 20M monthly users, support cold-start for new items, ' +
      '<100ms serving latency, A/B test framework, GDPR consent handling, optimize for CTR and margin.',
    expectCompliance: ['GDPR'],
    minPerfGoals: 4,
  },

  // ── RAG / chatbot ─────────────────────────────────────────────────────
  {
    domain: 'rag',
    kind: 'vague',
    input: 'make a chatbot that answers from our docs',
    minInferred: 2,
  },
  {
    domain: 'rag',
    kind: 'detailed',
    input:
      'Enterprise RAG chatbot over 50GB of PDF technical manuals, citations with page numbers, ' +
      'respond in <3s, 500 concurrent users, SSO and RBAC for sensitive docs, ' +
      'hallucination rate <2% on eval set, on-premise deployment (no external API calls).',
    minPerfGoals: 4,
  },

  // ── Speech / ASR ──────────────────────────────────────────────────────
  {
    domain: 'speech',
    kind: 'vague',
    input: 'turn meeting recordings into text',
    minInferred: 2,
  },
  {
    domain: 'speech',
    kind: 'detailed',
    input:
      'Meeting transcription for 10-person video calls, real-time streaming at <500ms latency, ' +
      'speaker diarization, technical vocabulary adaptation (~500 jargon terms), punctuation + capitalization, ' +
      'summarization of key decisions, GDPR-compliant 30-day retention, English + Spanish.',
    expectCompliance: ['GDPR'],
    minPerfGoals: 4,
  },
];

// ── Grading ───────────────────────────────────────────────────────────────

interface Grade {
  case: TestCase;
  ok: boolean;
  latencyMs: number;
  perfGoalsCount: number;
  perfGoalsWithNumericTarget: number;
  inferredCount: number;
  gapsCount: number;
  conflictsCount: number;
  complianceFound: string[];
  summaryLen: number;
  domainLabel: string;
  notes: string[];
  score: number; // /10
  exitReason?: string;
  raw: unknown;
}

function hasNumericTarget(target: string): boolean {
  // Accept things like "<200ms", ">85%", ">=99.9%", "10K", "50 queries/s", "1GB"
  return /\d/.test(target);
}

function gradeCase(
  tc: TestCase,
  response: Record<string, unknown>,
  latencyMs: number,
): Grade {
  const spec = (response.goalSpec ?? {}) as Record<string, unknown>;
  const perfGoals = ((spec.performance_goals ?? []) as Array<{ metric: string; target: string }>) ?? [];
  const inferred = ((spec.inferred_requirements ?? []) as unknown[]) ?? [];
  const gaps = ((spec.gaps ?? []) as unknown[]) ?? [];
  const conflicts = ((spec.conflicts ?? []) as unknown[]) ?? [];
  const constraints = (spec.constraints ?? {}) as { compliance?: string[] };
  const compliance = (constraints.compliance ?? []) as string[];
  const summary = (spec.summary ?? '') as string;
  const domainLabel = (spec.domain ?? '') as string;

  const notes: string[] = [];
  let score = 0;

  // 1. Structural presence (2 pts)
  if (domainLabel) score += 1;
  else notes.push('missing domain label');
  if (summary && summary.length > 50) score += 1;
  else notes.push(`summary too short (${summary.length}ch)`);

  // 2. Performance goals (3 pts)
  const minPerf = tc.minPerfGoals ?? 3;
  const numericGoals = perfGoals.filter((g) => hasNumericTarget(g.target ?? ''));
  if (perfGoals.length >= minPerf) score += 1;
  else notes.push(`only ${perfGoals.length}/${minPerf} perf goals`);
  if (numericGoals.length >= Math.max(2, Math.floor(minPerf * 0.6))) score += 1;
  else notes.push(`only ${numericGoals.length} goals have numeric targets`);
  if (perfGoals.length > 0 && numericGoals.length === perfGoals.length) score += 1;

  // 3. Inferred requirements (2 pts)
  const minInferred = tc.minInferred ?? 2;
  if (inferred.length >= minInferred) score += 1;
  else notes.push(`only ${inferred.length}/${minInferred} inferred reqs`);
  if (tc.kind === 'vague' && inferred.length >= 3) score += 1;
  if (tc.kind === 'detailed' && inferred.length >= 2) score += 1;

  // 4. Compliance detection (2 pts)
  if (tc.expectCompliance?.length) {
    const hits = tc.expectCompliance.filter((c) =>
      compliance.some((actual) => actual.toUpperCase().includes(c.toUpperCase())),
    );
    if (hits.length === tc.expectCompliance.length) score += 2;
    else if (hits.length > 0) score += 1;
    else notes.push(`missing expected compliance: ${tc.expectCompliance.join(',')}`);
  } else {
    score += 2; // no compliance expected; full marks
  }

  // 5. Gaps identified for vague inputs (1 pt)
  if (tc.kind === 'vague') {
    if (gaps.length >= 1) score += 1;
    else notes.push('vague input but no gaps identified');
  } else {
    // detailed inputs may have few gaps; auto credit
    score += 1;
  }

  return {
    case: tc,
    ok: score >= 7,
    latencyMs,
    perfGoalsCount: perfGoals.length,
    perfGoalsWithNumericTarget: numericGoals.length,
    inferredCount: inferred.length,
    gapsCount: gaps.length,
    conflictsCount: conflicts.length,
    complianceFound: compliance,
    summaryLen: summary.length,
    domainLabel,
    notes,
    score,
    exitReason: response.exitReason as string | undefined,
    raw: spec,
  };
}

// ── Runner ────────────────────────────────────────────────────────────────

async function runCase(tc: TestCase, draftOnly: boolean): Promise<Grade> {
  const url = `http://localhost:3000/api/analyze-requirements${draftOnly ? '?draft=true' : ''}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: tc.input }),
  });
  const latencyMs = Date.now() - t0;
  const body = await res.json();
  if (!res.ok) {
    console.error(`  [FAIL] ${tc.domain}/${tc.kind} → HTTP ${res.status}:`, body);
    return {
      case: tc,
      ok: false,
      latencyMs,
      perfGoalsCount: 0,
      perfGoalsWithNumericTarget: 0,
      inferredCount: 0,
      gapsCount: 0,
      conflictsCount: 0,
      complianceFound: [],
      summaryLen: 0,
      domainLabel: '',
      notes: [`http ${res.status}: ${JSON.stringify(body).slice(0, 200)}`],
      score: 0,
      raw: body,
    };
  }
  return gradeCase(tc, body, latencyMs);
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

async function main(): Promise<void> {
  const draftOnly = process.env.FULL !== '1';
  console.log(
    `Running ${CASES.length} goalspec cases (mode=${draftOnly ? 'draft' : 'full-adversary'})...\n`,
  );

  const grades: Grade[] = [];
  for (const tc of CASES) {
    process.stdout.write(`- ${tc.domain.padEnd(14)} ${tc.kind.padEnd(8)} ...`);
    try {
      const g = await runCase(tc, draftOnly);
      grades.push(g);
      console.log(` score=${g.score}/10 perf=${g.perfGoalsCount} inf=${g.inferredCount} gaps=${g.gapsCount} compliance=[${g.complianceFound.join(',')}] (${g.latencyMs}ms)`);
    } catch (err) {
      console.log(' ERR', err instanceof Error ? err.message : err);
    }
  }

  // Summary table
  console.log('\n\n## Summary\n');
  console.log(
    '| Domain | Kind | Score | Perf (num) | Inferred | Gaps | Compliance | Latency | Notes |',
  );
  console.log(
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const g of grades) {
    const c = g.case;
    const compliance = g.complianceFound.length ? g.complianceFound.join(',') : '—';
    const notes = g.notes.length ? g.notes.join('; ') : 'ok';
    console.log(
      `| ${c.domain} | ${c.kind} | ${g.score}/10 | ${g.perfGoalsCount} (${g.perfGoalsWithNumericTarget}) | ${g.inferredCount} | ${g.gapsCount} | ${compliance} | ${g.latencyMs}ms | ${notes} |`,
    );
  }

  const passed = grades.filter((g) => g.ok).length;
  console.log(`\n**Pass rate:** ${passed}/${grades.length} (score ≥7)`);
  const avg = grades.reduce((s, g) => s + g.score, 0) / Math.max(1, grades.length);
  console.log(`**Average score:** ${avg.toFixed(1)}/10`);
  const avgLatency = grades.reduce((s, g) => s + g.latencyMs, 0) / Math.max(1, grades.length);
  console.log(`**Average latency:** ${avgLatency.toFixed(0)}ms`);

  // Persist
  const outDir = path.join(process.cwd(), 'docs', 'test-results');
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `goalspec-${stamp}.json`);
  await fs.writeFile(
    outPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        mode: draftOnly ? 'draft' : 'full-adversary',
        grades: grades.map((g) => ({ ...g, raw: g.raw })),
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nResults saved: ${outPath}`);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
