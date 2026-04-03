'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ChevronRight, ChevronLeft, X, ExternalLink,
  Compass, Loader2, AlertCircle, Send,
} from 'lucide-react';
import {
  LAYER_COLORS,
  LAYER_LABELS,
  type AppMode,
  type Service,
  type Workflow,
  type WorkflowStep,
} from '@/types/ecosystem';
import { NVIDIA_SERVICES } from '@/data/nvidia';

// NVIDIA palette difficulty colours
const DIFF_COLORS = {
  beginner:     '#76b900',
  intermediate: '#a3e635',
  advanced:     '#ffffff',
};

interface SidebarProps {
  mode: AppMode;
  activeWorkflow: Workflow | null;
  activeStepIndex: number;
  hoveredService: Service | null;
  onSelectWorkflow: (wf: Workflow) => void;
  onExplore: () => void;
  onStepChange: (index: number) => void;
  onExitWorkflow: () => void;
  onBackToInitial: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({
  mode,
  activeWorkflow,
  activeStepIndex,
  hoveredService,
  onSelectWorkflow,
  onExplore,
  onStepChange,
  onExitWorkflow,
  onBackToInitial,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const [goal, setGoal]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [unverified, setUnverified] = useState<{
    message: string;
    suggestedServices: Array<{ id: string; name: string; officialUrl: string }>;
  } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleGenerate = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setUnverified(null);

    try {
      const res = await fetch('/api/generate-flow', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ goal: trimmed }),
      });

      const data = (await res.json()) as {
        verified?:         boolean;
        goal?:             string;
        steps?:            WorkflowStep[];
        message?:          string;
        suggestedServices?: Array<{ id: string; name: string; officialUrl: string }>;
        error?:            string;
      };

      // Hard API / network error
      if (data.error) {
        setError(data.error);
        return;
      }

      // Groq couldn't verify a valid documented path
      if (data.verified === false) {
        setUnverified({
          message:           data.message ?? 'No documented NVIDIA path found for this goal.',
          suggestedServices: data.suggestedServices ?? [],
        });
        return;
      }

      if (!res.ok) {
        setError('Something went wrong — try rephrasing');
        return;
      }

      // Build a synthetic Workflow from the AI response
      const wf: Workflow = {
        id:          `ai-${Date.now()}`,
        goal:        data.goal ?? trimmed,
        description: `AI-generated path for: ${trimmed}`,
        difficulty:  'intermediate',
        steps:       data.steps ?? [],
      };

      onSelectWorkflow(wf);
      setGoal('');
    } catch {
      setError('Network error — check your connection');
    } finally {
      setLoading(false);
    }
  }, [goal, loading, onSelectWorkflow]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate],
  );

  return (
    <aside className={`fixed top-0 left-0 bottom-0 w-72 z-30 flex flex-col bg-[#050505] border-r border-[#1a1a1a] overflow-hidden transition-transform duration-300 ease-in-out sm:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>

      {/* ── Branding ────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-5 border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
            <rect width="28" height="20" rx="2" fill="#76b900" />
            <text x="4" y="14" fontSize="9" fontWeight="900" fill="#000" fontFamily="Arial">NV</text>
          </svg>
          <span className="text-base font-bold tracking-[0.2em] text-[#76b900] uppercase">
            NVIDIA
          </span>
        </div>
        <h1 className="text-white font-bold text-base leading-snug">AI Ecosystem</h1>
        <p className="text-sm text-slate-500 mt-0.5">18 services · 6 layers · official docs</p>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <AnimatePresence mode="wait">

          {/* ── INITIAL — AI goal input ───────────────────────────────── */}
          {mode === 'initial' && (
            <motion.div
              key="initial"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="px-6 pt-6 space-y-5"
            >
              {/* Heading */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={13} className="text-[#76b900]" />
                  <span className="text-xs font-bold uppercase tracking-widest text-[#76b900]">
                    AI Path Generator
                  </span>
                </div>
                <p className="text-slate-300 text-base font-medium leading-relaxed">
                  What are you trying to build?
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  Describe your goal — Groq AI will map the right NVIDIA services.
                </p>
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={goal}
                  onChange={(e) => { setGoal(e.target.value); setError(null); setUnverified(null); }}
                  onKeyDown={handleKey}
                  placeholder="e.g. Deploy a medical imaging model with low-latency inference…"
                  rows={3}
                  className="w-full bg-[#0d1117] border border-[#1e293b] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#76b900] transition-colors resize-none"
                />
                <button
                  onClick={handleGenerate}
                  disabled={!goal.trim() || loading}
                  className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-md flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background: goal.trim() && !loading ? '#76b900' : '#1e293b' }}
                  title="Generate path (Enter)"
                >
                  {loading
                    ? <Loader2 size={13} className="text-white animate-spin" />
                    : <Send size={12} className={goal.trim() ? 'text-black' : 'text-slate-500'} />
                  }
                </button>
              </div>

              {/* Hard error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-900/40 bg-red-950/20"
                >
                  <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-red-300 text-base leading-relaxed">{error}</p>
                </motion.div>
              )}

              {/* Unverified — no documented path found */}
              {unverified && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: '#76b90030', background: '#76b90008' }}
                >
                  {/* Header */}
                  <div
                    className="flex items-start gap-2 px-3 py-2.5"
                    style={{ borderBottom: '1px solid #76b90020' }}
                  >
                    <AlertCircle size={12} className="text-[#76b900] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-[#76b900] uppercase tracking-widest mb-0.5">
                        Cannot verify path
                      </p>
                      <p className="text-slate-400 text-sm leading-relaxed">
                        {unverified.message}
                      </p>
                    </div>
                  </div>

                  {/* Suggested services */}
                  {unverified.suggestedServices.length > 0 && (
                    <div className="px-3 py-2.5 space-y-2">
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">
                        Services to investigate
                      </p>
                      {unverified.suggestedServices.map((svc) => (
                        <div key={svc.id} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: '#76b900' }}
                            />
                            <span className="text-white text-sm font-medium truncate">
                              {svc.name}
                            </span>
                          </div>
                          <a
                            href={svc.officialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 p-1 rounded transition-colors hover:bg-[#76b90020]"
                            title="Open official docs"
                          >
                            <ExternalLink size={10} style={{ color: '#76b900' }} />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dismiss */}
                  <button
                    onClick={() => setUnverified(null)}
                    className="w-full text-center text-sm text-slate-700 hover:text-slate-500 transition-colors py-2"
                    style={{ borderTop: '1px solid #76b90015' }}
                  >
                    Try a different goal
                  </button>
                </motion.div>
              )}

              {/* Loading shimmer */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-2"
                >
                  {[60, 80, 50].map((w, i) => (
                    <div
                      key={i}
                      className="h-2.5 rounded animate-pulse"
                      style={{ width: `${w}%`, background: '#76b90015' }}
                    />
                  ))}
                  <p className="text-sm text-[#76b900]/60 font-mono mt-2">
                    Groq is generating your path…
                  </p>
                </motion.div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#1e293b]" />
                <span className="text-sm text-slate-600 uppercase tracking-widest">or</span>
                <div className="flex-1 h-px bg-[#1e293b]" />
              </div>

              {/* Explore freely */}
              <button
                onClick={onExplore}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[#1e293b] hover:border-[#76b900]/50 bg-[#0d1117] group transition-all"
              >
                <div className="flex items-center gap-3">
                  <Compass size={16} className="text-[#76b900]" />
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold group-hover:text-[#76b900] transition-colors">
                      Explore freely
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Hover any service for details</p>
                  </div>
                </div>
                <ChevronRight size={13} className="text-slate-600 group-hover:text-[#76b900] transition-colors" />
              </button>
            </motion.div>
          )}

          {/* ── WORKFLOW — step navigator ─────────────────────────────── */}
          {mode === 'workflow' && activeWorkflow && (
            <motion.div
              key="workflow"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col h-full"
            >
              {/* Goal header */}
              <div className="px-6 pt-5 pb-4 border-b border-[#1a1a1a] shrink-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles size={10} className="text-[#76b900]" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#76b900]">
                        AI Generated
                      </span>
                    </div>
                    <h2 className="text-white font-bold text-base leading-snug">
                      {activeWorkflow.goal}
                    </h2>
                  </div>
                  <button
                    onClick={onExitWorkflow}
                    className="shrink-0 text-slate-500 hover:text-white transition-colors mt-0.5"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden mt-3">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #76b900, #a3e635)' }}
                    animate={{
                      width: `${(activeStepIndex / Math.max(activeWorkflow.steps.length - 1, 1)) * 100}%`,
                    }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
                <p className="text-sm text-slate-500 mt-1.5">
                  Step {activeStepIndex + 1} of {activeWorkflow.steps.length}
                </p>
              </div>

              {/* Steps list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 min-h-0">
                {activeWorkflow.steps.map((step, idx) => {
                  const isActive    = idx === activeStepIndex;
                  const isCompleted = idx < activeStepIndex;
                  return (
                    <button
                      key={`${step.serviceId}-${idx}`}
                      onClick={() => onStepChange(idx)}
                      className="w-full text-left rounded-lg p-3 border transition-all"
                      style={{
                        borderColor:      isActive ? '#76b900' : '#1e293b',
                        background:       isActive ? '#76b90010' : '#0d1117',
                        borderLeftWidth:  3,
                        borderLeftColor:  isActive ? '#76b900' : isCompleted ? '#76b90060' : '#1e293b',
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                          style={{
                            background: isCompleted || isActive ? '#76b900' : '#1e293b',
                            color:      isCompleted || isActive ? '#000' : '#64748b',
                            boxShadow:  isActive ? '0 0 8px #76b900' : 'none',
                          }}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">
                            {NVIDIA_SERVICES.find((s) => s.id === step.serviceId)?.name ??
                              step.serviceId
                                .split('-')
                                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                                .join(' ')}
                          </p>
                          <p className="text-slate-500 text-xs">
                            {step.role || NVIDIA_SERVICES.find((s) => s.id === step.serviceId)?.tags[0] || ''}
                          </p>
                        </div>
                      </div>
                      {isActive && (
                        <p className="text-slate-300 text-sm leading-relaxed mt-2.5 pl-7 break-words">
                          {step.action}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Nav footer */}
              <div className="px-4 py-4 border-t border-[#1a1a1a] flex gap-2 shrink-0">
                <button
                  onClick={() => onStepChange(activeStepIndex - 1)}
                  disabled={activeStepIndex === 0}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#1e293b] text-sm text-slate-300 hover:border-slate-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <button
                  onClick={() => onStepChange(activeStepIndex + 1)}
                  disabled={activeStepIndex === activeWorkflow.steps.length - 1}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-base font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: '#76b900', color: '#000' }}
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>

              <div className="px-4 pb-4 shrink-0">
                <button
                  onClick={onBackToInitial}
                  className="w-full text-center text-sm text-slate-600 hover:text-slate-400 transition-colors"
                >
                  ← Try a different goal
                </button>
              </div>
            </motion.div>
          )}

          {/* ── EXPLORE — hover detail panel ──────────────────────────── */}
          {mode === 'explore' && (
            <motion.div
              key="explore"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="px-6 pt-5 pb-4"
            >
              <button
                onClick={onBackToInitial}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#76b900] transition-colors mb-5"
              >
                <ChevronLeft size={12} /> Back to goals
              </button>

              <AnimatePresence mode="wait">
                {hoveredService ? (
                  <motion.div
                    key={hoveredService.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <div>
                      <span
                        className="text-base font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                        style={{
                          color:      LAYER_COLORS[hoveredService.layer].hex,
                          background: LAYER_COLORS[hoveredService.layer].dim,
                          border:     `1px solid ${LAYER_COLORS[hoveredService.layer].hex}40`,
                        }}
                      >
                        {LAYER_LABELS[hoveredService.layer]}
                      </span>
                      <h3 className="text-white font-bold text-base mt-2 leading-snug">
                        {hoveredService.name}
                      </h3>
                    </div>

                    <p className="text-slate-300 text-base leading-relaxed">
                      {hoveredService.fullDescription}
                    </p>

                    <a
                      href={hoveredService.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-base font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                      style={{ background: '#76b900', color: '#000' }}
                    >
                      Official docs <ExternalLink size={10} />
                    </a>

                    <div className="flex flex-wrap gap-1">
                      {hoveredService.tags.map((t) => (
                        <span
                          key={t}
                          className="text-sm px-2 py-0.5 rounded bg-[#1e293b] text-slate-400 border border-[#334155]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    {hoveredService.connections.length > 0 && (
                      <div>
                        <p className="text-sm uppercase tracking-widest text-slate-600 font-semibold mb-2">
                          Connects to
                        </p>
                        <div className="space-y-1.5">
                          {hoveredService.connections.map((id) => (
                            <div key={id} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#76b900' }} />
                              <span className="text-slate-400 text-base">
                                {id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center py-12"
                  >
                    <div
                      className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center"
                      style={{ background: '#76b90015', border: '1px solid #76b90040' }}
                    >
                      <Compass size={18} className="text-[#76b900]" />
                    </div>
                    <p className="text-slate-500 text-base leading-relaxed">
                      Hover over any service node to see its official description and connections.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-t border-[#1a1a1a] shrink-0">
        <p className="text-sm text-slate-700 leading-relaxed">
          All data sourced from official NVIDIA documentation.
          <br />
          <span className="text-slate-600">docs.nvidia.com · developer.nvidia.com</span>
        </p>
      </div>
    </aside>
  );
}
