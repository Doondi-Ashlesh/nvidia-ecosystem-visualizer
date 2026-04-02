export type Layer =
  | 'access'
  | 'sdk'
  | 'framework'
  | 'agent'
  | 'serving'
  | 'enterprise';

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
};

export type WorkflowStep = {
  serviceId: string;
  role: string;
  action: string;
};

export type Workflow = {
  id: string;
  goal: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  steps: WorkflowStep[];
};

/** App-level mode driving which visual state is shown */
export type AppMode = 'initial' | 'explore' | 'workflow';

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
  sdk:        'CUDA stack & inference engines',
  framework:  'Build, train & customize',
  agent:      'Orchestrate & deploy agents',
  serving:    'Deploy & serve models',
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
