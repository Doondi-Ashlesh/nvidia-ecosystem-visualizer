'use client';

import { useMemo, useEffect, useCallback, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnimatePresence } from 'framer-motion';
import ServiceNode from '@/components/ServiceNode';
import NodeTooltip from '@/components/NodeTooltip';
import { NVIDIA_SERVICES } from '@/data/nvidia';
import { getWorkflowNodeIds, getWorkflowEdgePairs, isWorkflowEdge } from '@/lib/workflow';
import { LAYER_ORDER } from '@/types/ecosystem';
import type { AppMode, Layer, Service, ServiceNodeData, Workflow } from '@/types/ecosystem';

interface EcosystemGraphProps {
  mode: AppMode;
  activeWorkflow: Workflow | null;
  activeStepIndex: number;
  onHoverService: (service: Service | null) => void;
  onClickService: (service: Service) => void;
  /** Layer to zoom into (set from layer-header hover in page.tsx) */
  focusLayer?: Layer | null;
}

// ── Fixed layout coordinates ──────────────────────────────────────────────────
const LAYER_X: Record<string, number> = {
  access:     50,
  sdk:        360,
  framework:  670,
  agent:      980,
  serving:    1290,
  enterprise: 1570,
};

const NODE_Y: Record<string, number> = {
  'build-nvidia':        60,
  'brev':               200,
  'ngc':                340,
  'dgx-cloud':          480,
  'cuda':                60,
  'cudnn':              200,
  'tensorrt':           340,
  'tensorrt-llm':       480,
  'nemo':                10,
  'nemo-curator':       145,
  'nemo-guardrails':    280,
  'nemo-retriever':     415,
  'ai-workbench':       550,
  'rapids':             685,
  'nemotron':           175,
  'nemo-agent-toolkit': 330,
  'blueprints':         485,
  'triton':             240,
  'nim':                390,
  'ai-enterprise':      315,
};

const NODE_TYPES: NodeTypes = { serviceNode: ServiceNode };

// ── Inner graph (inside ReactFlowProvider) ────────────────────────────────────
function GraphInner({
  mode,
  activeWorkflow,
  activeStepIndex,
  onHoverService,
  onClickService,
  focusLayer,
}: EcosystemGraphProps) {
  const { fitView } = useReactFlow();

  // Hover tooltip (workflow / initial modes)
  const [tooltipService, setTooltipService] = useState<Service | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const workflowNodeIds = useMemo(
    () => (activeWorkflow ? getWorkflowNodeIds(activeWorkflow) : []),
    [activeWorkflow],
  );

  // Mouse-move callback — hover tooltip for non-explore modes
  const handleNodeMouseMove = useCallback(
    (service: Service, x: number, y: number) => {
      setTooltipService(service);
      setMousePos({ x, y });
    },
    [],
  );

  const handleNodeHover = useCallback(
    (service: Service | null) => {
      if (!service) setTooltipService(null);
      onHoverService(service);
    },
    [onHoverService],
  );

  // ── Nodes ──────────────────────────────────────────────────────────────────
  const nodes = useMemo<Node<ServiceNodeData>[]>(() => {
    return NVIDIA_SERVICES.map((service) => {
      const inWorkflow    = workflowNodeIds.includes(service.id);
      const isHighlighted = activeWorkflow !== null && inWorkflow;
      const isDimmed =
        mode === 'initial' ||
        (activeWorkflow !== null && !inWorkflow);
      const isActiveStep =
        activeWorkflow !== null &&
        activeWorkflow.steps[activeStepIndex]?.serviceId === service.id;
      const stepIdx = workflowNodeIds.indexOf(service.id);

      const data: ServiceNodeData = {
        service,
        stepNumber:     stepIdx >= 0 ? stepIdx + 1 : undefined,
        isHighlighted,
        isDimmed:       mode === 'explore' ? false : isDimmed,
        isActiveStep,
        isExploreMode:  mode === 'explore',
        onHover:        handleNodeHover,
        onMouseMove:    handleNodeMouseMove,
      };

      return {
        id:        service.id,
        type:      'serviceNode',
        position:  { x: LAYER_X[service.layer] ?? 0, y: NODE_Y[service.id] ?? 0 },
        data,
        draggable: false,
      };
    });
  }, [
    mode, activeWorkflow, activeStepIndex, workflowNodeIds,
    handleNodeHover, handleNodeMouseMove,
  ]);

  // ── Edges ──────────────────────────────────────────────────────────────────
  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];
    const addedIds = new Set<string>();

    // Helper to push one edge
    function pushEdge(
      srcId: string,
      tgtId: string,
      isWf: boolean,
      opacity: number,
    ) {
      const id = `${srcId}->${tgtId}`;
      if (addedIds.has(id)) return;
      addedIds.add(id);
      result.push({
        id,
        source:   srcId,
        target:   tgtId,
        type:     'smoothstep',
        animated: isWf,
        style: {
          stroke:      isWf ? '#76b900' : '#334155',
          strokeWidth: isWf ? 2 : 1,
          opacity,
        },
        markerEnd: {
          type:   'arrowclosed' as const,
          color:  isWf ? '#76b900' : '#334155',
          width:  14,
          height: 14,
        },
      });
    }

    // 1. Official connection edges (from service.connections)
    for (const service of NVIDIA_SERVICES) {
      for (const targetId of service.connections) {
        const wfEdge      = isWorkflowEdge(service.id, targetId, activeWorkflow);
        const bothVisible =
          workflowNodeIds.includes(service.id) && workflowNodeIds.includes(targetId);

        let opacity: number;
        if (mode === 'initial')       opacity = 0.12;
        else if (mode === 'explore')  opacity = 0.28;
        else if (wfEdge)              opacity = 1;
        else if (bothVisible)         opacity = 0.18;
        else                          opacity = 0.06;

        pushEdge(service.id, targetId, wfEdge, opacity);
      }
    }

    // 2. Workflow path edges — connect CONSECUTIVE steps directly even if no
    //    official connection exists (cross-layer jump support)
    if (activeWorkflow) {
      const pairs = getWorkflowEdgePairs(activeWorkflow);
      for (const [srcId, tgtId] of pairs) {
        // pushEdge is a no-op if the edge already exists
        pushEdge(srcId, tgtId, true, 1);
      }
    }

    return result;
  }, [mode, activeWorkflow, workflowNodeIds]);

  // ── Auto-pan to active workflow step ──────────────────────────────────────
  useEffect(() => {
    if (!activeWorkflow) return;
    const stepId = activeWorkflow.steps[activeStepIndex]?.serviceId;
    if (stepId) {
      fitView({ nodes: [{ id: stepId }], duration: 600, padding: 0.6, maxZoom: 1.2 });
    }
  }, [activeStepIndex, activeWorkflow, fitView]);

  // ── Zoom into a hovered layer ──────────────────────────────────────────────
  useEffect(() => {
    if (!focusLayer) return;
    const layerNodeIds = NVIDIA_SERVICES
      .filter((s) => s.layer === focusLayer)
      .map((s) => ({ id: s.id }));
    fitView({ nodes: layerNodeIds, duration: 500, padding: 0.3 });
  }, [focusLayer, fitView]);

  // Reset fitView when focus layer cleared
  useEffect(() => {
    if (focusLayer === null) {
      fitView({ duration: 450, padding: 0.08 });
    }
  }, [focusLayer, fitView]);

  // Reset to full view when switching to explore mode
  useEffect(() => {
    if (mode === 'explore') {
      fitView({ duration: 500, padding: 0.08 });
    }
  }, [mode, fitView]);

  return (
    <div
      className={`w-full h-full relative${mode === 'explore' ? ' explore-mode' : ''}`}
      onMouseLeave={() => setTooltipService(null)}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        panOnScroll
        zoomOnScroll
        panOnDrag
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#000000' }}
        onNodeClick={(_, node) => {
          const service = NVIDIA_SERVICES.find((s) => s.id === node.id);
          if (service) onClickService(service);
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="#1a1a1a"
        />
        <Controls
          position="bottom-right"
          showInteractive={false}
          className="nv-controls"
        />
      </ReactFlow>

      {/* Hover HUD tooltip — non-explore modes only */}
      <AnimatePresence>
        {mode !== 'explore' && tooltipService && (
          <NodeTooltip
            service={tooltipService}
            x={mousePos.x}
            y={mousePos.y}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Public component — wraps with ReactFlowProvider ───────────────────────────
export default function EcosystemGraph(props: EcosystemGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}

// Re-export LAYER_X so page.tsx can compute column centres
export { LAYER_X, LAYER_ORDER };
