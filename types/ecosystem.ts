export type Layer =
  | 'access'
  | 'sdk'
  | 'framework'
  | 'agent'
  | 'serving'
  | 'enterprise';

/** An officially documented NVIDIA agent skill from the nvidia/skills catalog */
export interface Skill {
  name: string;        // kebab-case identifier from SKILL.md
  version: string;     // semver string from SKILL.md
  description: string; // one-sentence description from SKILL.md
  repoUrl: string;     // direct link to SKILL.md on GitHub
}

/** Skills grouped by the service they belong to — used by the retriever */
export interface ServiceSkills {
  serviceId: string;
  skills: Skill[];
}

export type Service = {
  id: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  officialUrl: string;
  layer: Layer;
  tags: string[];
  /** IDs of services this officially connects to (directed: this → other) */
  connections: string[];
  /** Officially documented agent skills for this service (from nvidia/skills catalog) */
  skills?: Skill[];
};

export type WorkflowStep = {
  serviceId: string;
  role: string;
  action: string;
  /** Data or artifacts this step receives as input (ML pipeline planner) */
  inputs?: string[];
  /** Data or artifacts this step produces as output (ML pipeline planner) */
  outputs?: string[];
};

export type Workflow = {
  id: string;
  goal: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  steps: WorkflowStep[];
};

/** App-level mode driving which visual state is shown */
export type AppMode = 'initial' | 'goalspec' | 'explore' | 'workflow';

// ── Stage 1: Goal Spec types (analyze-requirements output) ────────────────────

/** A single measurable performance target derived from the user's goal */
export interface PerformanceGoal {
  metric: string;           // e.g. "inference_latency_p95", "retrieval_recall_at_10"
  target: string;           // e.g. "<200ms", ">85%", ">99.9%"
  rationale: string;        // why this target was set
}

/** A requirement the system inferred that the user didn't explicitly state */
export interface InferredRequirement {
  requirement: string;      // e.g. "output guardrails for medical safety"
  reason: string;           // e.g. "healthcare domain requires explainable, safe outputs"
}

/** A gap — something the user should have specified but didn't */
export interface GoalGap {
  gap: string;              // e.g. "no training dataset specified"
  suggestion: string;       // e.g. "specify data source or use synthetic data via NeMo Curator"
}

/** A conflict — contradictory or impossible requirements */
export interface GoalConflict {
  conflict: string;         // e.g. "real-time inference on consumer GPU with 70B model"
  severity: 'warning' | 'blocking';
  suggestion: string;       // how to resolve
}

/** Complete structured goal spec — output of Stage 1 (POST /api/analyze-requirements) */
export interface GoalSpec {
  domain: string;           // e.g. "clinical decision support"
  use_case_type: string;    // e.g. "real-time inference + retrieval"
  performance_goals: PerformanceGoal[];
  constraints: {
    compliance: string[];   // e.g. ["HIPAA", "SOC2"]
    hardware: string;       // e.g. "cloud GPU (A100/H100)"
    scale: string;          // e.g. "multi-tenant, hospital-grade"
    other: string[];        // any additional constraints
  };
  inferred_requirements: InferredRequirement[];
  gaps: GoalGap[];
  conflicts: GoalConflict[];
  summary: string;          // 2-3 sentence enriched goal description
}

// NVIDIA brand palette: green only — no layer-specific accent colors
const NV_GREEN = '#76b900';
export const LAYER_COLORS: Record<Layer, { hex: string; dim: string; glow: string }> = {
  access:     { hex: NV_GREEN, dim: '#76b90015', glow: '#76b90040' },
  sdk:        { hex: NV_GREEN, dim: '#76b90015', glow: '#76b90040' },
  framework:  { hex: NV_GREEN, dim: '#76b90015', glow: '#76b90040' },
  agent:      { hex: NV_GREEN, dim: '#76b90015', glow: '#76b90040' },
  serving:    { hex: NV_GREEN, dim: '#76b90015', glow: '#76b90040' },
  enterprise: { hex: NV_GREEN, dim: '#76b90015', glow: '#76b90040' },
};

export const LAYER_LABELS: Record<Layer, string> = {
  access:     'Access',
  sdk:        'SDK / Runtime',
  framework:  'Frameworks',
  agent:      'Agentic AI',
  serving:    'Serving',
  enterprise: 'Enterprise',
};

export const LAYER_SUBLABELS: Record<Layer, string> = {
  access:     'Entry points & GPU cloud',
  sdk:        'CUDA stack & GPU primitives',
  framework:  'Build, train & customize',
  agent:      'Orchestrate & deploy agents',
  serving:    'Optimize, compile & serve models',
  enterprise: 'Production & compliance',
};

/** Data passed to the ServiceNode React Flow custom node */
export type ServiceNodeData = {
  service: Service;
  /** 1-based step number badge shown on workflow path */
  stepNumber?: number;
  isHighlighted: boolean;
  isDimmed: boolean;
  isActiveStep: boolean;
  isExploreMode: boolean;
  /** Which layer header is currently hovered — drives dim/highlight effect */
  focusLayer?: Layer | null;
  onHover: (service: Service | null) => void;
  /** Mouse-move callback used to track cursor position for the hover tooltip (non-explore modes) */
  onMouseMove?: (service: Service, x: number, y: number) => void;
  [key: string]: unknown;
};

/** All layers in display order (left → right) */
export const LAYER_ORDER: Layer[] = [
  'access',
  'sdk',
  'framework',
  'agent',
  'serving',
  'enterprise',
];
