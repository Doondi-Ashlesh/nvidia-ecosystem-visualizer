'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Menu, FileDown, FolderDown, Package, Loader2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import EcosystemGraph from '@/components/EcosystemGraph';
import { LAYER_ORDER, LAYER_LABELS, LAYER_SUBLABELS } from '@/types/ecosystem';
import type { AppMode, Layer, Service, Workflow, GoalSpec } from '@/types/ecosystem';
import { downloadPipelineZip } from '@/lib/export-zip';

// ── Export buttons — shown at bottom-left of graph in workflow mode ──────────

function ExportButtons({ goalSpec, workflow, notebookReady, cachedNotebook }: { goalSpec: GoalSpec; workflow: Workflow; notebookReady: boolean; cachedNotebook: string | null }) {
  const [scaffoldingLoading, setScaffoldingLoading] = useState(false);
  const [exportAllLoading, setExportAllLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScaffolding = useCallback(async () => {
    setScaffoldingLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate-scaffolding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalSpec, steps: workflow.steps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Scaffolding failed');

      // Download as zip (docs only, no notebook)
      downloadPipelineZip({
        prd: data.prd,
        stack: data.stack,
        architecture: data.architecture,
        features: data.features,
        claudeMd: data.claudeMd,
        agentsMd: data.agentsMd,
        notebookJson: '{}', // empty — scaffolding only
        goalName: `scaffolding-${workflow.id}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setScaffoldingLoading(false);
    }
  }, [goalSpec, workflow]);

  const handleExportAll = useCallback(async () => {
    if (!cachedNotebook) return; // shouldn't happen — button only shows when notebook is ready
    setExportAllLoading(true);
    setError(null);
    try {
      // Fetch scaffolding (instant — zero LLM calls)
      const scaffRes = await fetch('/api/generate-scaffolding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalSpec, steps: workflow.steps }),
      });
      const scaffData = await scaffRes.json();
      if (!scaffRes.ok) throw new Error(scaffData.error ?? 'Scaffolding failed');

      // Use cached notebook — no re-generation needed
      downloadPipelineZip({
        prd: scaffData.prd,
        stack: scaffData.stack,
        architecture: scaffData.architecture,
        features: scaffData.features,
        claudeMd: scaffData.claudeMd,
        agentsMd: scaffData.agentsMd,
        notebookJson: cachedNotebook,
        goalName: workflow.id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setExportAllLoading(false);
    }
  }, [goalSpec, workflow, cachedNotebook]);

  const anyLoading = scaffoldingLoading || exportAllLoading;

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="text-xs text-red-400 bg-red-900/30 border border-red-800/30 px-3 py-1.5 rounded-lg max-w-[280px]">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleScaffolding}
          disabled={anyLoading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border border-slate-700 hover:border-[#76b900] bg-black/80 backdrop-blur-sm"
          style={{ color: scaffoldingLoading ? '#4a7300' : '#76b900' }}
          title="Download PRD, stack, architecture, CLAUDE.md, AGENTS.md"
        >
          {scaffoldingLoading ? <Loader2 size={13} className="animate-spin" /> : <FolderDown size={13} />}
          Docs
        </button>
        {notebookReady && (
        <button
          onClick={handleExportAll}
          disabled={anyLoading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border border-slate-700 hover:border-[#76b900] bg-black/80 backdrop-blur-sm"
          style={{ color: exportAllLoading ? '#4a7300' : '#76b900' }}
          title="Download docs + notebook as zip"
        >
          {exportAllLoading ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />}
          {exportAllLoading ? 'Generating...' : 'Export All'}
        </button>
        )}
      </div>
    </div>
  );
}

// Abbreviated labels for column headers at medium/tablet widths
const LAYER_SHORT_LABELS: Record<string, string> = {
  access:     'Access',
  sdk:        'SDK',
  framework:  'Frameworks',
  agent:      'Agentic',
  serving:    'Serving',
  enterprise: 'Enterprise',
};

// Services in each layer — used by layer dropdown
import { NVIDIA_SERVICES } from '@/data/nvidia';

export default function Home() {
  const [mode, setMode]                       = useState<AppMode>('initial');
  const [activeWorkflow, setActiveWorkflow]   = useState<Workflow | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [hoveredService, setHoveredService]   = useState<Service | null>(null);
  const [focusLayer, setFocusLayer]           = useState<Layer | null>(null);
  const [dropdownLayer, setDropdownLayer]     = useState<Layer | null>(null);
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [goalSpec, setGoalSpec]               = useState<GoalSpec | null>(null);
  const [notebookReady, setNotebookReady]     = useState(false);
  const [cachedNotebook, setCachedNotebook]   = useState<string | null>(null);

  const handleGoalSpecReady = useCallback((spec: GoalSpec) => {
    setGoalSpec(spec);
    setMode('goalspec');
  }, []);

  const handleSelectWorkflow = useCallback((wf: Workflow) => {
    setActiveWorkflow(wf);
    setActiveStepIndex(0);
    setMode('workflow');
  }, []);

  const handleExplore = useCallback(() => {
    setMode('explore');
    setActiveWorkflow(null);
    setActiveStepIndex(0);
  }, []);

  const handleExitWorkflow = useCallback(() => {
    setMode('initial');
    setActiveWorkflow(null);
    setActiveStepIndex(0);
  }, []);

  const handleBackToInitial = useCallback(() => {
    setMode('initial');
    setActiveWorkflow(null);
    setActiveStepIndex(0);
    setHoveredService(null);
    setNotebookReady(false);
    setCachedNotebook(null);
  }, []);

  const handleStepChange = useCallback((index: number) => {
    setActiveStepIndex(index);
  }, []);

  const handleHoverService = useCallback((service: Service | null) => {
    if (mode === 'explore') setHoveredService(service);
  }, [mode]);

  const handleClickService = useCallback((service: Service) => {
    if (mode === 'explore') {
      setHoveredService(service);
    } else if (mode === 'workflow' && activeWorkflow) {
      const stepIdx = activeWorkflow.steps.findIndex((s) => s.serviceId === service.id);
      if (stepIdx >= 0) setActiveStepIndex(stepIdx);
    }
  }, [mode, activeWorkflow]);

  const handleLayerEnter = useCallback((layer: Layer) => {
    setFocusLayer(layer);
    setDropdownLayer(layer);
  }, []);

  const handleLayerLeave = useCallback(() => {
    setFocusLayer(null);
    setDropdownLayer(null);
  }, []);

  return (
    <div className="fixed inset-0 bg-black flex overflow-hidden">

      {/* Mobile backdrop — closes sidebar when tapped */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        mode={mode}
        activeWorkflow={activeWorkflow}
        activeStepIndex={activeStepIndex}
        hoveredService={hoveredService}
        goalSpec={goalSpec}
        onGoalSpecReady={handleGoalSpecReady}
        onSelectWorkflow={handleSelectWorkflow}
        onExplore={handleExplore}
        onStepChange={handleStepChange}
        onExitWorkflow={handleExitWorkflow}
        onBackToInitial={handleBackToInitial}
        onNotebookReady={(nb: string) => { setNotebookReady(true); setCachedNotebook(nb); }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main — full width on mobile (sidebar overlays), offset on sm+ */}
      <div className="flex-1 flex flex-col min-w-0 sm:ml-72">

        {/* Top bar — NVIDIA Developer portal style */}
        <div className="h-14 flex items-center px-4 sm:px-6 border-b border-[#1a1a1a] shrink-0 bg-black gap-3">

          {/* Hamburger — mobile only */}
          <button
            className="sm:hidden shrink-0 text-slate-400 hover:text-[#76b900] transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          {/* Mode indicator */}
          <div className="flex-1 min-w-0 hidden sm:block">
            {mode === 'initial' && (
              <p className="text-slate-500 text-sm truncate">
                <span className="text-slate-300 font-semibold">AI Ecosystem Visualizer</span>
                <span className="hidden lg:inline text-slate-600"> — Describe your goal or explore all 25 services</span>
              </p>
            )}
            {mode === 'goalspec' && (
              <p className="text-slate-500 text-sm truncate">
                <span className="text-[#76b900] font-semibold">Requirements Analysis</span>
                <span className="hidden lg:inline"> — Review inferred requirements, then generate service path</span>
              </p>
            )}
            {mode === 'explore' && (
              <p className="text-slate-500 text-sm truncate">
                <span className="text-[#76b900] font-semibold">Explore Mode</span>
                <span className="hidden lg:inline"> — Click any service node to see its description</span>
              </p>
            )}
            {mode === 'workflow' && activeWorkflow && (
              <p className="text-slate-500 text-sm truncate">
                <span className="text-[#76b900] font-semibold">{activeWorkflow.goal}</span>
                <span className="hidden lg:inline"> — Follow the numbered steps</span>
              </p>
            )}
          </div>

          {/* NVIDIA Developer nav links — right side */}
          <div className="ml-auto hidden lg:flex items-center gap-6 shrink-0">
            <a href="https://developer.nvidia.com" target="_blank" rel="noopener noreferrer"
              className="text-[13px] text-slate-300 hover:text-white transition-colors tracking-wide">
              Home
            </a>
            <a href="https://developer.nvidia.com/blog" target="_blank" rel="noopener noreferrer"
              className="text-[13px] text-slate-300 hover:text-white transition-colors tracking-wide">
              Blog
            </a>
            <a href="https://forums.developer.nvidia.com" target="_blank" rel="noopener noreferrer"
              className="text-[13px] hover:text-white transition-colors tracking-wide"
              style={{ color: '#7dd3f8' }}>
              Forums
            </a>
            <a href="https://docs.nvidia.com" target="_blank" rel="noopener noreferrer"
              className="text-[13px] text-slate-300 hover:text-white transition-colors tracking-wide">
              Docs
            </a>
            <a href="https://developer.nvidia.com/downloads" target="_blank" rel="noopener noreferrer"
              className="text-[13px] text-slate-300 hover:text-white transition-colors tracking-wide">
              Downloads
            </a>
            <a href="https://www.nvidia.com/en-us/training/" target="_blank" rel="noopener noreferrer"
              className="text-[13px] text-slate-300 hover:text-white transition-colors tracking-wide">
              Training
            </a>
          </div>
        </div>

        {/* Layer headers in flow (real height), then graph — fitView only fills the graph pane, so rows sit under titles */}
        <div className="flex-1 min-h-0 flex flex-col relative min-w-0">
          {/* Layer column headers — flex-equal so they span the full width */}
          <div className="shrink-0 flex bg-black z-10 border-b border-[#1a1a1a] pointer-events-none">
            {LAYER_ORDER.map((layer, layerIdx) => {
              const isActive = dropdownLayer === layer;
              const isFirst  = layerIdx === 0;
              const isLast   = layerIdx === LAYER_ORDER.length - 1;
              const layerServices = NVIDIA_SERVICES.filter((s) => s.layer === layer);

              // Clamp dropdown so first column doesn't overflow left, last doesn't overflow right
              const dropdownPosition = isFirst
                ? 'left-0'
                : isLast
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2';

              return (
                <div
                  key={layer}
                  className="flex-1 relative pointer-events-auto min-w-0"
                  onMouseEnter={() => handleLayerEnter(layer)}
                  onMouseLeave={handleLayerLeave}
                >
                  {/* Header label */}
                  <div
                    className="text-center py-2.5 px-1 cursor-pointer transition-colors"
                    style={{ borderBottom: isActive ? '1px solid #76b90040' : '1px solid transparent' }}
                  >
                    <p
                      className="text-[11px] font-bold uppercase tracking-widest transition-colors truncate"
                      style={{ color: isActive ? '#76b900' : '#76b900aa' }}
                    >
                      {/* Short label on medium screens, full label on lg+ */}
                      <span className="lg:hidden">{LAYER_SHORT_LABELS[layer]}</span>
                      <span className="hidden lg:inline">{LAYER_LABELS[layer]}</span>
                    </p>
                    <p
                      className="text-[9px] mt-0.5 truncate transition-colors hidden lg:block"
                      style={{ color: isActive ? '#64748b' : '#374151' }}
                    >
                      {LAYER_SUBLABELS[layer]}
                    </p>
                  </div>

                  {/* Dropdown panel */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scaleY: 0.9 }}
                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, y: -4, scaleY: 0.95 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className={`absolute top-full mt-1 z-50 ${dropdownPosition}`}
                        style={{
                          transformOrigin:      'top center',
                          width:                'max-content',
                          maxWidth:             220,
                          background:           'rgba(0,0,0,0.55)',
                          backdropFilter:       'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                          border:               '1px solid #76b90040',
                          borderRadius:         6,
                          boxShadow:            '0 0 20px #76b90015, 0 8px 32px rgba(0,0,0,0.6)',
                        }}
                      >
                        <div className="p-3 space-y-2.5">
                          {/* Layer name */}
                          <div>
                            <p className="text-xs font-bold text-[#76b900] uppercase tracking-widest">
                              {LAYER_LABELS[layer]}
                            </p>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                              {LAYER_SUBLABELS[layer]}
                            </p>
                          </div>

                          {/* Thin divider */}
                          <div
                            className="h-px"
                            style={{ background: 'linear-gradient(90deg, #76b900, transparent)' }}
                          />

                          {/* Services in this layer — each with docs link */}
                          <div className="space-y-1.5">
                            {layerServices.map((s) => (
                              <div key={s.id} className="flex items-start gap-1.5 group/svc">
                                <span
                                  className="w-1 h-1 rounded-full mt-1.5 shrink-0"
                                  style={{ background: '#76b900' }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <p className="text-xs text-white font-medium leading-tight">
                                      {s.name}
                                    </p>
                                    <a
                                      href={s.officialUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 opacity-0 group-hover/svc:opacity-100 transition-opacity p-0.5 rounded hover:bg-[#76b90020]"
                                      title={`Open official ${s.name} docs`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink size={9} style={{ color: '#76b900' }} />
                                    </a>
                                  </div>
                                  <p className="text-[11px] text-slate-500 leading-snug">
                                    {s.shortDescription}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <div className="flex-1 min-h-0 relative min-w-0">
            <EcosystemGraph
              mode={mode}
              activeWorkflow={activeWorkflow}
              activeStepIndex={activeStepIndex}
              onHoverService={handleHoverService}
              onClickService={handleClickService}
              focusLayer={focusLayer}
            />

            {/* Export buttons — bottom-left of graph, visible only in workflow mode */}
            {mode === 'workflow' && activeWorkflow && goalSpec && (
              <div className="absolute bottom-4 left-4 flex gap-2 z-20">
                <ExportButtons goalSpec={goalSpec} workflow={activeWorkflow} notebookReady={notebookReady} cachedNotebook={cachedNotebook} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
