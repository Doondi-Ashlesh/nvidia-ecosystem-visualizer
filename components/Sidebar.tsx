'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ChevronRight, ChevronLeft, X, ExternalLink,
  Compass, Loader2, AlertCircle, Send, Brain, Download,
} from 'lucide-react';
import {
  LAYER_COLORS,
  LAYER_LABELS,
  type AppMode,
  type Service,
  type Workflow,
  type WorkflowStep,
  type GoalSpec,
} from '@/types/ecosystem';
import { NVIDIA_SERVICES } from '@/data/nvidia';

function serviceFromCatalog(serviceId: string) {
  return NVIDIA_SERVICES.find((s) => s.id === serviceId);
}

/** Product title — always from `data/nvidia.ts`, never model-invented labels */
function catalogStepTitle(serviceId: string): string {
  const svc = serviceFromCatalog(serviceId);
  if (svc) return svc.name;
  return serviceId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Subtitle — official `shortDescription` from catalog; model `role` only if id unknown */
function catalogStepSubtitle(serviceId: string, modelRole: string): string {
  const svc = serviceFromCatalog(serviceId);
  if (svc) return svc.shortDescription;
  return modelRole || '';
}

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
  goalSpec: GoalSpec | null;
  onGoalSpecReady: (spec: GoalSpec) => void;
  onSelectWorkflow: (wf: Workflow) => void;
  onExplore: () => void;
  onStepChange: (index: number) => void;
  onExitWorkflow: () => void;
  onBackToInitial: () => void;
  onNotebookReady?: (notebookJson: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

// ── Reasoning panel ───────────────────────────────────────────────────────────

const REASONING_SECTIONS = [
  { key: '▸ GOAL',       label: 'Goal Analysis' },
  { key: '▸ CANDIDATES', label: 'Service Candidates' },
  { key: '▸ EXCLUDED',   label: 'Exclusions Applied' },
  { key: '▸ SEQUENCE',   label: 'Path Rationale' },
];

function parseReasoning(raw: string): Array<{ label: string; body: string }> | null {
  const sections: Array<{ label: string; body: string }> = [];
  for (let i = 0; i < REASONING_SECTIONS.length; i++) {
    const { key, label } = REASONING_SECTIONS[i];
    const nextKey = REASONING_SECTIONS[i + 1]?.key;
    const start = raw.indexOf(key);
    if (start === -1) continue;
    const end   = nextKey ? raw.indexOf(nextKey, start + key.length) : raw.length;
    const body  = raw.slice(start + key.length, end === -1 ? raw.length : end)
      .replace(/^[\s:]+/, '')
      .trim();
    if (body) sections.push({ label, body });
  }
  return sections.length >= 2 ? sections : null;
}

function ReasoningPanel({ reasoning }: { reasoning: string }) {
  const sections = parseReasoning(reasoning);

  return (
    <div
      className="rounded-lg p-3 space-y-3 max-h-72 overflow-y-auto"
      style={{ background: '#050d00', border: '1px solid #76b90020' }}
    >
      {sections ? (
        sections.map(({ label, body }) => (
          <div key={label}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1"
              style={{ color: '#76b900' }}>
              {label}
            </p>
            <p className="text-[11px] text-slate-300 leading-relaxed">{body}</p>
          </div>
        ))
      ) : (
        // Fallback: render raw reasoning as clean paragraphs
        reasoning.split('\n').filter(l => l.trim()).map((line, i) => (
          <p key={i} className="text-[11px] text-slate-300 leading-relaxed">{line}</p>
        ))
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar({
  mode,
  activeWorkflow,
  activeStepIndex,
  hoveredService,
  goalSpec,
  onGoalSpecReady,
  onSelectWorkflow,
  onExplore,
  onStepChange,
  onExitWorkflow,
  onBackToInitial,
  onNotebookReady,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const [goal, setGoal]           = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [unverified, setUnverified] = useState<{
    message: string;
    suggestedServices: Array<{ id: string; name: string; officialUrl: string }>;
  } | null>(null);
  const [exportingNotebook, setExportingNotebook] = useState(false);
  const [exportNotebookError, setExportNotebookError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Stage 1: Analyze goal → produce GoalSpec
  const handleAnalyze = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setUnverified(null);

    try {
      const res = await fetch('/api/analyze-requirements', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ input: trimmed }),
      });

      const data = (await res.json()) as {
        goalSpec?: GoalSpec;
        error?:    string;
      };

      if (data.error || !data.goalSpec) {
        setError(data.error ?? 'Failed to analyze requirements');
        return;
      }

      onGoalSpecReady(data.goalSpec);
    } catch {
      setError('Network error — check your connection');
    } finally {
      setLoading(false);
    }
  }, [goal, loading, onGoalSpecReady]);

  // Stage 2: GoalSpec → service path
  const handleConfirmGoalSpec = useCallback(async () => {
    if (!goalSpec || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/generate-flow', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ goalSpec }),
      });

      const data = (await res.json()) as {
        verified?:          boolean;
        goal?:              string;
        steps?:             WorkflowStep[];
        message?:           string;
        suggestedServices?: Array<{ id: string; name: string; officialUrl: string }>;
        error?:             string;
        reasoning?:         string | null;
      };

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.verified === false) {
        setUnverified({
          message:           data.message ?? 'No NVIDIA path found for these requirements.',
          suggestedServices: data.suggestedServices ?? [],
        });
        return;
      }

      const wf: Workflow = {
        id:          `ai-${Date.now()}`,
        goal:        data.goal ?? goalSpec.summary,
        description: `AI-generated path for: ${goalSpec.summary}`,
        difficulty:  'intermediate',
        steps:       data.steps ?? [],
      };

      setReasoning(data.reasoning ?? null);
      setShowReasoning(false);
      onSelectWorkflow(wf);
      setGoal('');
    } catch {
      setError('Network error — check your connection');
    } finally {
      setLoading(false);
    }
  }, [goalSpec, loading, onSelectWorkflow]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAnalyze();
      }
    },
    [handleAnalyze],
  );

  // Stage 3: Generate notebook from path (LLM call with code grounding)
  const handleExportNotebook = useCallback(async () => {
    if (!activeWorkflow || exportingNotebook) return;
    setExportNotebookError(null);
    setExportingNotebook(true);
    try {
      const res = await fetch('/api/generate-notebook', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          goal:  activeWorkflow.goal,
          steps: activeWorkflow.steps,
          // Pass GoalSpec when available so the notebook generator has PRD-style
          // context (performance targets, compliance, inferred requirements).
          ...(goalSpec ? { goalSpec } : {}),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Notebook generation failed (${res.status})`);
      }
      const text = await res.text();
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nvidia-pipeline-${activeWorkflow.id.replace(/[^a-zA-Z0-9-_]/g, '_')}.ipynb`;
      a.click();
      URL.revokeObjectURL(url);
      onNotebookReady?.(text);
    } catch (e) {
      setExportNotebookError(e instanceof Error ? e.message : 'Notebook generation failed');
    } finally {
      setExportingNotebook(false);
    }
  }, [activeWorkflow, exportingNotebook, onNotebookReady, goalSpec]);

  return (
    <aside className={`fixed top-0 left-0 bottom-0 w-72 z-30 flex flex-col bg-[#050505] border-r border-[#1a1a1a] overflow-hidden transition-transform duration-300 ease-in-out sm:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>

      {/* ── Branding ────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-5 border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-2.5 mb-1">
          {/* Official NVIDIA eye mark */}
            <img src="/nvidia.png" alt="NVIDIA" width={28} height={28} style={{ objectFit: 'contain' }} />
          <span className="text-[13px] font-black tracking-[0.22em] text-[#76b900] uppercase leading-none">
            NVIDIA
          </span>
        </div>
        <h1 className="text-white font-bold text-base leading-snug">AI Ecosystem</h1>
        <p className="text-sm text-slate-500 mt-0.5">25 services · 6 layers · official docs</p>
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
                  Describe your goal — Nemotron will map the right NVIDIA services.
                </p>
                <p className="text-[11px] text-slate-600 mt-2 leading-snug">
                  Stronger prompts name <span className="text-slate-500">domain</span> (e.g. healthcare RAG),{' '}
                  <span className="text-slate-500">data placement</span> (on-prem vs cloud), and{' '}
                  <span className="text-slate-500">scale</span> (team vs enterprise).
                </p>
              </div>

              {/* Textarea — taller default so long prompts are readable (vertical space) */}
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={goal}
                  onChange={(e) => { setGoal(e.target.value); setError(null); setUnverified(null); }}
                  onKeyDown={handleKey}
                  placeholder="e.g. Enterprise RAG on our on-prem clinical docs + pubmed abstracts, HIPAA-aware, multi-region…"
                  rows={7}
                  className="w-full min-h-[10.5rem] bg-[#0d1117] border border-[#1e293b] rounded-lg px-3 py-2.5 pr-11 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#76b900] transition-colors resize-y leading-relaxed"
                />
                <button
                  onClick={handleAnalyze}
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
                    Nemotron is generating your path…
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
                    <p className="text-xs text-slate-500 mt-0.5">Click on any service to see details</p>
                  </div>
                </div>
                <ChevronRight size={13} className="text-slate-600 group-hover:text-[#76b900] transition-colors" />
              </button>
            </motion.div>
          )}

          {/* ── GOALSPEC — requirements display + confirm ───────────── */}
          {mode === 'goalspec' && goalSpec && (
            <motion.div
              key="goalspec"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex flex-col gap-3"
            >
              {/* Domain badge */}
              <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(118,185,0,0.1)', border: '1px solid rgba(118,185,0,0.2)' }}>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: '#76b900' }}>Domain</p>
                <p className="text-white text-sm font-semibold mt-0.5">{goalSpec.domain}</p>
                <p className="text-slate-400 text-xs mt-0.5">{goalSpec.use_case_type}</p>
              </div>

              {/* Summary */}
              <p className="text-slate-300 text-xs leading-relaxed">{goalSpec.summary}</p>

              {/* Performance goals */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#76b900' }}>Performance Goals</p>
                {goalSpec.performance_goals.map((pg, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span className="text-slate-400">{pg.metric}</span>
                    <span className="text-white font-mono">{pg.target}</span>
                  </div>
                ))}
              </div>

              {/* Compliance */}
              {goalSpec.constraints.compliance.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#76b900' }}>Compliance</p>
                  <div className="flex flex-wrap gap-1">
                    {goalSpec.constraints.compliance.map((c, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-800/30">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Inferred requirements */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#76b900' }}>Inferred Requirements</p>
                {goalSpec.inferred_requirements.map((r, i) => (
                  <p key={i} className="text-xs text-slate-400 py-0.5">• {r.requirement}</p>
                ))}
              </div>

              {/* Gaps */}
              {goalSpec.gaps.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1 text-amber-400">Gaps</p>
                  {goalSpec.gaps.map((g, i) => (
                    <p key={i} className="text-xs text-amber-300/70 py-0.5">• {g.gap}</p>
                  ))}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-red-900/20 border border-red-800/30">
                  <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleConfirmGoalSpec}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-black transition-all"
                  style={{ background: loading ? '#4a7300' : '#76b900' }}
                >
                  {loading ? (
                    <><Loader2 size={14} className="animate-spin" /> Generating path...</>
                  ) : (
                    <><Sparkles size={14} /> Generate Path</>
                  )}
                </button>
                <button
                  onClick={onBackToInitial}
                  disabled={loading}
                  className="px-3 py-2.5 rounded-lg text-xs text-slate-400 border border-slate-700 hover:border-slate-500 transition-colors"
                >
                  Edit
                </button>
              </div>
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
              {/* Compact workflow chrome — goal text hidden to maximize step list space */}
              <div className="px-4 pt-3 pb-2 border-b border-[#1a1a1a] shrink-0 flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500 tabular-nums min-w-0">
                  Step {activeStepIndex + 1} of {activeWorkflow.steps.length}
                </p>
                <button
                  type="button"
                  onClick={onExitWorkflow}
                  className="shrink-0 p-1 rounded-md text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Close workflow"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Steps list — reasoning toggle lives inside so it scrolls with steps */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 min-h-0">

                {/* Model Reasoning toggle (inside scroll area) */}
                {reasoning && (
                  <div className="space-y-1 mb-2">
                    <button
                      onClick={() => setShowReasoning((v) => !v)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
                      style={{
                        background: showReasoning ? '#76b90018' : 'transparent',
                        border:     '1px solid #76b90030',
                      }}
                    >
                      <Brain size={10} style={{ color: '#76b900' }} className="shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#76b900]">
                        Model Reasoning
                      </span>
                      <ChevronRight
                        size={10}
                        style={{ color: '#76b90080', marginLeft: 'auto' }}
                        className={`shrink-0 transition-transform ${showReasoning ? 'rotate-90' : ''}`}
                      />
                    </button>
                    <AnimatePresence>
                      {showReasoning && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <ReasoningPanel reasoning={reasoning} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
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
                          <p className="text-white text-sm font-semibold break-words">
                            {catalogStepTitle(step.serviceId)}
                          </p>
                          <p className="text-slate-500 text-xs leading-snug break-words mt-0.5">
                            {catalogStepSubtitle(step.serviceId, step.role)}
                          </p>
                        </div>
                      </div>
                      {isActive && (
                        <>
                          <p className="text-slate-300 text-sm leading-relaxed mt-2.5 pl-7 break-words">
                            {step.action}
                          </p>
                          {step.outputs && step.outputs.length > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono mt-1.5 pl-7 flex-wrap">
                              <span style={{ color: '#76b90060' }}>→</span>
                              {step.outputs.map((o) => (
                                <span key={o} className="px-1.5 py-0.5 rounded" style={{ background: '#76b90015' }}>{o}</span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Export orchestration notebook */}
              <div className="px-4 pt-2 shrink-0 space-y-1">
                <button
                  type="button"
                  onClick={handleExportNotebook}
                  disabled={exportingNotebook}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#76b90040] text-sm font-semibold text-[#76b900] hover:bg-[#76b90012] transition-all disabled:opacity-40"
                >
                  {exportingNotebook ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Download Jupyter notebook
                </button>
                {exportNotebookError && (
                  <p className="text-[11px] text-red-400 px-1">{exportNotebookError}</p>
                )}
                <p className="text-[10px] text-slate-600 px-1 leading-snug">
                  Plan + per-step stubs (NIM, NGC, NeMo, …) — fill in your env and data paths.
                </p>
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
                      Official Docs <ExternalLink size={10} />
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

                    {hoveredService.skills && hoveredService.skills.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">
                          Agent Skills ({hoveredService.skills.length})
                        </p>
                        <div className="space-y-1.5">
                          {hoveredService.skills.map((skill) => (
                            <div
                              key={skill.name}
                              className="rounded-lg border px-2.5 py-2"
                              style={{ borderColor: '#76b90025', background: '#76b90008' }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-mono text-[#76b900] font-semibold truncate">
                                  {skill.name}
                                </span>
                                <a
                                  href={skill.repoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0"
                                >
                                  <ExternalLink size={9} style={{ color: '#76b90060' }} />
                                </a>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                {skill.description}
                              </p>
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
                      Click on any service node to see its official description.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer — single “powered by” tag only ───────────────────────── */}
      <div className="px-4 py-2 border-t border-[#1a1a1a] shrink-0">
        <div
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{ background: '#76b90012', border: '1px solid #76b90030' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: '#76b900', boxShadow: '0 0 4px #76b900' }}
          />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#76b900]">
            Powered by Nemotron
          </span>
        </div>
      </div>
    </aside>
  );
}
