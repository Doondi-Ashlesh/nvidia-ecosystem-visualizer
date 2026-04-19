/**
 * Scaffolding Templates — generates markdown documentation from structured data.
 *
 * Zero LLM calls. GoalSpec + service path already contain all the information
 * needed for PRD, stack, architecture, feature specs, CLAUDE.md, and AGENTS.md.
 * This module formats that data into readable markdown files.
 */

import type { GoalSpec, WorkflowStep } from '@/types/ecosystem';
import { NVIDIA_SERVICES } from '@/data/nvidia';

const serviceById = new Map(NVIDIA_SERVICES.map((s) => [s.id, s]));

// ── PRD.md ──────────────────────────────────────────────────────────────────

export function buildPRD(goalSpec: GoalSpec): string {
  const sections: string[] = [
    `# Product Requirements Document`,
    '',
    `## Overview`,
    '',
    `**Domain:** ${goalSpec.domain}`,
    `**Use Case:** ${goalSpec.use_case_type}`,
    '',
    goalSpec.summary,
    '',
    `## Performance Goals`,
    '',
    '| Metric | Target | Rationale |',
    '|---|---|---|',
    ...goalSpec.performance_goals.map(
      (p) => `| ${p.metric} | ${p.target} | ${p.rationale} |`
    ),
    '',
    `## Constraints`,
    '',
  ];

  if (goalSpec.constraints.compliance.length > 0) {
    sections.push(`**Compliance:** ${goalSpec.constraints.compliance.join(', ')}`);
  }
  if (goalSpec.constraints.hardware) {
    sections.push(`**Hardware:** ${goalSpec.constraints.hardware}`);
  }
  if (goalSpec.constraints.scale) {
    sections.push(`**Scale:** ${goalSpec.constraints.scale}`);
  }
  if (goalSpec.constraints.other?.length) {
    sections.push(`**Other:** ${goalSpec.constraints.other.join(', ')}`);
  }

  sections.push('', `## Inferred Requirements`, '', '> Requirements the system identified as necessary based on best practices.', '');
  for (const r of goalSpec.inferred_requirements) {
    sections.push(`- **${r.requirement}** — ${r.reason}`);
  }

  if (goalSpec.gaps.length > 0) {
    sections.push('', `## Known Gaps`, '', '> Information not provided that should be specified before implementation.', '');
    for (const g of goalSpec.gaps) {
      sections.push(`- **${g.gap}** — Suggestion: ${g.suggestion}`);
    }
  }

  if (goalSpec.conflicts.length > 0) {
    sections.push('', `## Conflicts`, '');
    for (const c of goalSpec.conflicts) {
      sections.push(`- **[${c.severity}]** ${c.conflict} — ${c.suggestion}`);
    }
  }

  return sections.join('\n');
}

// ── stack.md ─────────────────────────────────────────────────────────────────

export function buildStack(goalSpec: GoalSpec, steps: WorkflowStep[]): string {
  const sections: string[] = [
    `# Technology Stack`,
    '',
    `**Domain:** ${goalSpec.domain}`,
    `**Goal:** ${goalSpec.summary}`,
    '',
    `## NVIDIA Services (${steps.length} services, ordered by data flow)`,
    '',
    '| # | Service | Layer | Role |',
    '|---|---|---|---|',
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const svc = serviceById.get(step.serviceId);
    const layer = svc?.layer ?? 'unknown';
    sections.push(`| ${i + 1} | ${svc?.name ?? step.serviceId} | ${layer} | ${step.role} |`);
  }

  sections.push('', '## Service Details', '');
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const svc = serviceById.get(step.serviceId);
    sections.push(
      `### ${i + 1}. ${svc?.name ?? step.serviceId}`,
      '',
      `- **ID:** \`${step.serviceId}\``,
      `- **Layer:** ${svc?.layer ?? 'unknown'}`,
      `- **Action:** ${step.action}`,
      `- **Docs:** ${svc?.officialUrl ?? 'N/A'}`,
      '',
    );
  }

  return sections.join('\n');
}

// ── architecture.md ─────────────────────────────────────────────────────────

export function buildArchitecture(steps: WorkflowStep[]): string {
  const sections: string[] = [
    `# Architecture`,
    '',
    `## Data Flow`,
    '',
    '```',
  ];

  // Build ASCII data flow diagram from inputs/outputs
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const svc = serviceById.get(step.serviceId);
    const name = svc?.name ?? step.serviceId;
    const ins = (step.inputs ?? []).join(', ') || 'none';
    const outs = (step.outputs ?? []).join(', ') || 'none';

    sections.push(`[${i + 1}] ${name}`);
    sections.push(`    IN:  ${ins}`);
    sections.push(`    OUT: ${outs}`);
    if (i < steps.length - 1) {
      sections.push(`    │`);
      sections.push(`    ▼`);
    }
  }

  sections.push('```', '', '## Service Connections', '');

  for (let i = 0; i < steps.length - 1; i++) {
    const from = serviceById.get(steps[i].serviceId)?.name ?? steps[i].serviceId;
    const to = serviceById.get(steps[i + 1].serviceId)?.name ?? steps[i + 1].serviceId;
    const output = (steps[i].outputs ?? [])[0] ?? 'data';
    sections.push(`- **${from}** → \`${output}\` → **${to}**`);
  }

  return sections.join('\n');
}

// ── features/*.md ───────────────────────────────────────────────────────────

export interface FeatureFile {
  name: string;   // filename without .md
  content: string;
}

export function buildFeatureSpecs(steps: WorkflowStep[]): FeatureFile[] {
  return steps.map((step, i) => {
    const svc = serviceById.get(step.serviceId);
    const name = step.serviceId;
    const content = [
      `# Feature: ${svc?.name ?? step.serviceId}`,
      '',
      `**Step:** ${i + 1} of ${steps.length}`,
      `**Service ID:** \`${step.serviceId}\``,
      `**Layer:** ${svc?.layer ?? 'unknown'}`,
      '',
      `## Purpose`,
      '',
      step.action,
      '',
      `## Data Flow`,
      '',
      `**Inputs:**`,
      ...(step.inputs ?? ['none']).map((inp) => `- ${inp}`),
      '',
      `**Outputs:**`,
      ...(step.outputs ?? ['none']).map((out) => `- ${out}`),
      '',
      `## Official Documentation`,
      '',
      `${svc?.officialUrl ?? 'N/A'}`,
    ].join('\n');

    return { name, content };
  });
}

// ── CLAUDE.md ───────────────────────────────────────────────────────────────
// Workflow document for AI coding agents (Claude Code, Cursor, etc.)
// Follows pattern from NVIDIA-AI-Blueprints/Retail-Agentic-Commerce:
// delegate to sibling docs, enforce documentation-first rule.

export function buildClaudeMD(goalSpec: GoalSpec, steps: WorkflowStep[]): string {
  const firstStep = steps[0];
  const firstSvc = firstStep ? serviceById.get(firstStep.serviceId) : null;

  return [
    `# CLAUDE.md`,
    '',
    `> Agent guide for this NVIDIA AI pipeline project.`,
    `> **Start by reading \`AGENTS.md\` for session workflow, quality gates, and verification requirements.**`,
    '',
    `## Project Goal`,
    '',
    goalSpec.summary,
    '',
    `## Quick Map`,
    '',
    `- \`docs/PRD.md\` — what we're building and why (goal, performance targets, constraints)`,
    `- \`docs/architecture.md\` — service data flow and connections`,
    `- \`docs/stack.md\` — NVIDIA services chosen and justifications`,
    `- \`docs/features/*.md\` — per-service implementation specs`,
    `- \`AGENTS.md\` — mandatory session workflow + quality gates`,
    `- \`notebook.ipynb\` — runnable end-to-end implementation`,
    '',
    `## First Task`,
    '',
    `When starting work on this project:`,
    '',
    `1. Read \`docs/PRD.md\` to understand the goal and performance targets`,
    `2. Read \`docs/architecture.md\` to understand the data flow`,
    firstStep
      ? `3. Start with step 1 (\`docs/features/${firstStep.serviceId}.md\`): ${firstSvc?.name ?? firstStep.serviceId}`
      : `3. Follow the implementation order in \`docs/stack.md\``,
    '',
    `## Documentation-First Rule`,
    '',
    `Before writing code for service X:`,
    `1. Read \`docs/features/X.md\` — understand inputs, outputs, and action`,
    `2. Verify the service ID against official NVIDIA docs`,
    `3. Check \`docs/architecture.md\` for upstream/downstream dependencies`,
    `4. Only then write code — cite the specific feature file you're implementing`,
    '',
    `## Hard Constraints (non-negotiable)`,
    '',
    ...(goalSpec.constraints.compliance.length
      ? [`- **Compliance:** ${goalSpec.constraints.compliance.join(', ')} — all code paths handling user data must satisfy these`]
      : []),
    ...(goalSpec.constraints.hardware ? [`- **Hardware target:** ${goalSpec.constraints.hardware}`] : []),
    ...(goalSpec.constraints.scale ? [`- **Scale:** ${goalSpec.constraints.scale}`] : []),
    ...goalSpec.performance_goals.map((p) => `- **${p.metric}:** ${p.target} — ${p.rationale}`),
    '',
    `## Key Conflicts (acknowledge before coding)`,
    '',
    ...(goalSpec.conflicts.length > 0
      ? goalSpec.conflicts.map((c) => `- **[${c.severity}]** ${c.conflict} → resolution: ${c.suggestion}`)
      : ['- None flagged during planning.']),
    '',
    `## Known Gaps (fill before production)`,
    '',
    ...(goalSpec.gaps.length > 0
      ? goalSpec.gaps.map((g) => `- ${g.gap} → ${g.suggestion}`)
      : ['- None flagged during planning.']),
    '',
    `## Dependencies`,
    '',
    '```bash',
    `pip install ${pickPipDependencies(steps).join(' ')}`,
    '```',
    '',
    `## Verification`,
    '',
    `After implementing each step, provide:`,
    `- The file path(s) you created or modified`,
    `- Runtime evidence (HTTP codes, stdout, or log excerpts) showing the step works`,
    `- Reference to the feature spec you implemented (\`docs/features/<service>.md\`)`,
    '',
    `Do not claim a step is complete without runtime evidence.`,
  ].join('\n');
}

/** Pick pip packages based on which services are in the path. */
function pickPipDependencies(steps: WorkflowStep[]): string[] {
  const ids = new Set(steps.map((s) => s.serviceId));
  const deps: string[] = [];
  if (ids.has('nemo-curator')) deps.push('nemo_curator');
  if (ids.has('nemo') || ids.has('megatron-lm') || ids.has('nemo-gym')) deps.push('nemo_toolkit[all]');
  if (ids.has('nemo-guardrails')) deps.push('nemoguardrails');
  if (ids.has('nemo-evaluator')) deps.push('nemo-evaluator-launcher');
  if (ids.has('model-optimizer')) deps.push('nvidia-modelopt');
  if (ids.has('triton')) deps.push('tritonclient[all]');
  if (ids.has('nim') || ids.has('nemotron') || ids.has('build-nvidia')) deps.push('openai');
  if (ids.has('rapids')) deps.push('cudf-cu12', 'cuml-cu12');
  if (ids.has('tensorrt') || ids.has('tensorrt-llm')) deps.push('tensorrt');
  if (deps.length === 0) deps.push('openai', 'nemo_toolkit');
  return deps;
}

// ── AGENTS.md ───────────────────────────────────────────────────────────────
// Mandatory workflow + quality gates. Follows Retail-Agentic-Commerce pattern.

export function buildAgentsMD(goalSpec: GoalSpec, steps: WorkflowStep[]): string {
  return [
    `# AGENTS.md`,
    '',
    `> Mandatory workflow, code standards, and verification requirements for any agent working on this project.`,
    `> Read this BEFORE writing any code.`,
    '',
    `## 1. Session Workflow (mandatory sequence)`,
    '',
    `Every task must follow these steps in order:`,
    '',
    `1. **Read** this file and \`CLAUDE.md\` for orientation`,
    `2. **Read specs** — \`docs/PRD.md\` for goal, \`docs/architecture.md\` for data flow, \`docs/features/<service>.md\` for the step you're implementing`,
    `3. **Plan** — confirm which service/step you're working on and what its inputs/outputs are`,
    `4. **Implement** — write code that matches the spec; do not invent APIs or services not in the feature docs`,
    `5. **Verify** — provide runtime evidence (command output, HTTP status, or logs) proving the code works`,
    '',
    `## 2. Documentation-First Development`,
    '',
    `| Task Type | Required Reading (before coding) |`,
    `|---|---|`,
    `| New service integration | \`docs/features/<service>.md\` + official NVIDIA docs for that service |`,
    `| Data flow change | \`docs/architecture.md\` (update it FIRST, then code) |`,
    `| Performance tuning | \`docs/PRD.md\` performance targets |`,
    `| Compliance/safety | \`docs/PRD.md\` constraints + \`CLAUDE.md\` hard constraints |`,
    '',
    `If a spec is wrong, update the spec first (commit separately), then implement.`,
    '',
    `## 3. Project Overview`,
    '',
    `**Domain:** ${goalSpec.domain}`,
    `**Use case:** ${goalSpec.use_case_type}`,
    `**Services in path:** ${steps.length}`,
    '',
    `Data flow:`,
    steps.map((s, i) => `${i + 1}. ${serviceById.get(s.serviceId)?.name ?? s.serviceId} (${s.serviceId})`).join(' → '),
    '',
    `## 4. Pipeline Agents (per-step responsibilities)`,
    '',
    ...steps.map((s, i) => {
      const svc = serviceById.get(s.serviceId);
      const ins = (s.inputs ?? []).join(', ') || 'none';
      const outs = (s.outputs ?? []).join(', ') || 'none';
      return [
        `### Agent ${i + 1}: ${svc?.name ?? s.serviceId}`,
        '',
        `- **Service ID:** \`${s.serviceId}\``,
        `- **Layer:** ${svc?.layer ?? 'unknown'}`,
        `- **Role:** ${s.role}`,
        `- **Action:** ${s.action}`,
        `- **Consumes:** ${ins}`,
        `- **Produces:** ${outs}`,
        `- **Spec:** \`docs/features/${s.serviceId}.md\``,
        `- **Official docs:** ${svc?.officialUrl ?? 'N/A'}`,
        '',
      ].join('\n');
    }),
    `## 5. Runtime Commands`,
    '',
    '```bash',
    `# Install dependencies`,
    `pip install ${pickPipDependencies(steps).join(' ')}`,
    '',
    `# Run the notebook end-to-end`,
    `jupyter notebook notebook.ipynb`,
    '',
    `# Or execute headless`,
    `jupyter nbconvert --to notebook --execute notebook.ipynb`,
    '```',
    '',
    `## 6. Quality Gates`,
    '',
    `Code is not complete until it passes all of the following:`,
    '',
    `- [ ] All imports resolve (no hallucinated module names)`,
    `- [ ] Every code cell can run in isolation given outputs of previous cells`,
    `- [ ] Every subprocess call has error handling (try/except around \`subprocess.run\`)`,
    `- [ ] Every file path either exists or is created by an earlier cell`,
    `- [ ] Every service API call uses the exact signature from official NVIDIA docs`,
    `- [ ] Performance-critical code paths include a timing measurement`,
    ...(goalSpec.constraints.compliance.length > 0
      ? [`- [ ] Compliance requirements (${goalSpec.constraints.compliance.join(', ')}) addressed in code, not just comments`]
      : []),
    '',
    `## 7. Code Standards`,
    '',
    `- Type hints on all public functions`,
    `- Environment variables for credentials (\`os.environ[...]\`) — never hardcode secrets`,
    `- Repository-relative paths only — no absolute paths that leak host identity`,
    `- Logging via Python \`logging\` module, not \`print\` for production code (notebooks may use \`print\`)`,
    '',
    `## 8. Verification Evidence (required in output)`,
    '',
    `When claiming a step works, include:`,
    '',
    `| Type | Example |`,
    `|---|---|`,
    `| HTTP response | \`200 OK — /v2/health/ready\` |`,
    `| File creation | \`$ ls models/ → asr.nemo, retrieval.pt\` |`,
    `| Metric | \`WER: 8.3% on held-out set\` |`,
    `| Stdout | \`Epoch 3 loss: 0.021 — saved checkpoint\` |`,
    '',
    `Do not claim "this works" based on the code compiling — prove it ran.`,
  ].join('\n');
}
