'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Menu } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import EcosystemGraph from '@/components/EcosystemGraph';
import { LAYER_ORDER, LAYER_LABELS, LAYER_SUBLABELS } from '@/types/ecosystem';
import type { AppMode, Layer, Service, Workflow } from '@/types/ecosystem';

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
  }, []);

  const handleStepChange = useCallback((index: number) => {
    setActiveStepIndex(index);
  }, []);

  const handleHoverService = useCallback((service: Service | null) => {
    if (mode === 'explore') setHoveredService(service);
  }, [mode]);

  const handleClickService = useCallback((service: Service) => {
    if (mode === 'explore') {
      window.open(service.officialUrl, '_blank', 'noopener,noreferrer');
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
        onSelectWorkflow={handleSelectWorkflow}
        onExplore={handleExplore}
        onStepChange={handleStepChange}
        onExitWorkflow={handleExitWorkflow}
        onBackToInitial={handleBackToInitial}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main — full width on mobile (sidebar overlays), offset on sm+ */}
      <div className="flex-1 flex flex-col min-w-0 sm:ml-72">

        {/* Top bar */}
        <div className="h-14 flex items-center px-4 sm:px-6 gap-3 border-b border-[#111] shrink-0 bg-black">
          {/* Hamburger — mobile only */}
          <button
            className="sm:hidden shrink-0 text-slate-400 hover:text-[#76b900] transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          {mode === 'initial' && (
            <p className="text-slate-500 text-sm truncate min-w-0">
              <span className="text-slate-300 font-semibold">NVIDIA AI Ecosystem</span>
              <span className="hidden sm:inline"> — Describe your goal to generate a custom path, or explore all services</span>
            </p>
          )}
          {mode === 'explore' && (
            <p className="text-slate-500 text-sm truncate min-w-0">
              <span className="text-[#76b900] font-semibold">Explore mode</span>
              <span className="hidden sm:inline"> — Hover any service for a tooltip · click to open official docs</span>
            </p>
          )}
          {mode === 'workflow' && activeWorkflow && (
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="text-[#76b900] font-semibold text-sm truncate max-w-[300px] shrink-0">
                {activeWorkflow.goal}
              </span>
              <span className="text-slate-700 text-xs shrink-0">·</span>
              <span className="text-slate-500 text-sm truncate hidden sm:block">
                Follow the numbered steps — highlighted nodes form your AI-generated path
              </span>
            </div>
          )}

          {/* Layer legend */}
          <div className="ml-auto hidden lg:flex items-center gap-4 shrink-0">
            {LAYER_ORDER.map((layer) => (
              <div key={layer} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#76b900' }} />
                <span className="text-xs text-slate-500 whitespace-nowrap">{LAYER_LABELS[layer]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Graph + layer header overlays */}
        <div className="flex-1 min-h-0 relative">
          <EcosystemGraph
            mode={mode}
            activeWorkflow={activeWorkflow}
            activeStepIndex={activeStepIndex}
            onHoverService={handleHoverService}
            onClickService={handleClickService}
            focusLayer={focusLayer}
          />

          {/* Layer column headers — flex-equal so they span the full width */}
          <div className="absolute top-0 left-0 right-0 z-10 flex pointer-events-none">
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
                      style={{ color: isActive ? '#76b900' : '#76b90055' }}
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
                          transformOrigin: 'top center',
                          width:      'max-content',
                          maxWidth:   220,
                          background: 'rgba(5,5,5,0.97)',
                          border:     '1px solid #76b90040',
                          borderRadius: 6,
                          boxShadow:  '0 0 20px #76b90015, 0 8px 32px rgba(0,0,0,0.9)',
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
        </div>
      </div>
    </div>
  );
}
