'use client';

import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { LAYER_LABELS, type Service } from '@/types/ecosystem';

interface NodeTooltipProps {
  service: Service;
  x: number;
  y: number;
  isExploreMode?: boolean;
}

const EDGE_MARGIN = 12;

export default function NodeTooltip({ service, x, y, isExploreMode = false }: NodeTooltipProps) {
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;

  const TOOLTIP_W = isExploreMode ? 360 : 300;
  const TOOLTIP_H = isExploreMode ? 260 : 220;

  const flipX   = x + 24 + TOOLTIP_W > vw - EDGE_MARGIN;
  const rawLeft = flipX ? x - TOOLTIP_W - 16 : x + 24;
  const left    = Math.min(Math.max(rawLeft, EDGE_MARGIN), vw - TOOLTIP_W - EDGE_MARGIN);

  const flipY  = y + TOOLTIP_H + 20 > vh - EDGE_MARGIN;
  const rawTop = flipY ? y - TOOLTIP_H - 10 : y - 14;
  const top    = Math.max(rawTop, EDGE_MARGIN);

  /* ── EXPLORE MODE — glass slab ────────────────────────────────────────── */
  if (isExploreMode) {
    return (
      <motion.div
        key={`explore-${service.id}`}
        initial={{ opacity: 0, y: flipY ? 8 : -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        className="fixed z-[9999] select-none"
        style={{ pointerEvents: 'none', left, top, width: TOOLTIP_W }}
      >
        <div
          style={{
            background:     'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border:         '1px solid #76b900',
            borderRadius:   8,
            boxShadow:      '0 0 0 1px #76b90018, 0 0 40px #76b90025, 0 20px 60px rgba(0,0,0,0.95)',
          }}
        >
          {/* Green top accent bar */}
          <div
            className="h-[3px] rounded-t-lg"
            style={{ background: 'linear-gradient(90deg, #76b900, #a3e63580, transparent)' }}
          />

          <div className="p-5 space-y-3.5">
            {/* Layer badge */}
            <span
              className="inline-block text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded"
              style={{
                background: '#76b90015',
                color:      '#76b900',
                border:     '1px solid #76b90030',
              }}
            >
              {LAYER_LABELS[service.layer]}
            </span>

            {/* Service name — green, prominent */}
            <h3
              className="font-bold text-[18px] leading-tight tracking-wide"
              style={{ color: '#76b900' }}
            >
              {service.name}
            </h3>

            {/* Divider */}
            <div
              className="h-px"
              style={{ background: 'linear-gradient(90deg, #76b90060, transparent)' }}
            />

            {/* Full description — white */}
            <p className="text-white text-sm leading-relaxed">
              {service.fullDescription}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {service.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-mono px-2 py-0.5 rounded"
                  style={{
                    background: '#76b90012',
                    color:      '#76b90099',
                    border:     '1px solid #76b90028',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Docs button */}
            <a
              href={service.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg transition-all group/doc"
              style={{
                background:    '#76b90015',
                border:        '1px solid #76b90040',
                pointerEvents: 'auto',
                color:         '#76b900',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-sm font-semibold group-hover/doc:text-white transition-colors">
                Open Official Docs
              </span>
              <ExternalLink
                size={14}
                className="shrink-0 group-hover/doc:text-white transition-colors"
              />
            </a>
          </div>
        </div>
      </motion.div>
    );
  }

  /* ── DEFAULT MODE — compact HUD tooltip ──────────────────────────────── */
  return (
    <motion.div
      key={service.id}
      initial={{ opacity: 0, scale: 0.94, y: flipY ? 6 : -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
      className="fixed z-[9999] select-none"
      style={{ pointerEvents: 'none', left, top, width: TOOLTIP_W }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          background:   'rgba(5, 5, 5, 0.97)',
          border:       '1px solid #76b900',
          borderRadius: 3,
          boxShadow:    '0 0 0 1px #76b90020, 0 0 24px #76b90020, 0 12px 40px rgba(0,0,0,0.95)',
        }}
      >
        {/* Scanline overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(118,185,0,0.018) 3px, rgba(118,185,0,0.018) 4px)',
          }}
        />

        {/* Corner brackets */}
        {[
          'top-0 left-0 border-t-2 border-l-2 -translate-x-px -translate-y-px',
          'top-0 right-0 border-t-2 border-r-2  translate-x-px -translate-y-px',
          'bottom-0 left-0 border-b-2 border-l-2 -translate-x-px  translate-y-px',
          'bottom-0 right-0 border-b-2 border-r-2  translate-x-px  translate-y-px',
        ].map((cls, i) => (
          <div key={i} className={`absolute w-2.5 h-2.5 border-[#76b900] ${cls}`} />
        ))}

        <div className="relative p-4 space-y-3">
          {/* Layer badge + name */}
          <div>
            <span
              className="inline-block text-[10px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-sm mb-2"
              style={{ background: '#76b90018', color: '#76b900', border: '1px solid #76b90035' }}
            >
              {LAYER_LABELS[service.layer]}
            </span>
            <p className="text-white font-bold text-[15px] leading-tight tracking-wide">
              {service.name}
            </p>
          </div>

          {/* Divider */}
          <div
            className="h-px"
            style={{ background: 'linear-gradient(90deg, #76b900 0%, #76b90050 60%, transparent 100%)' }}
          />

          {/* Short description */}
          <p className="text-slate-300 text-sm leading-relaxed">
            {service.shortDescription}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {service.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm"
                style={{ background: '#76b90010', color: '#76b90088', border: '1px solid #76b90025' }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Docs link */}
          <a
            href={service.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 w-full mt-1 pt-2 transition-colors group/link"
            style={{ borderTop: '1px solid #76b90020', color: '#76b90060', pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={11} className="shrink-0 group-hover/link:text-[#76b900] transition-colors" style={{ color: 'inherit' }} />
            <span className="text-[11px] font-mono tracking-wide group-hover/link:text-[#76b900] transition-colors" style={{ color: 'inherit' }}>
              {service.officialUrl.replace(/^https?:\/\//, '').split('/')[0]}
            </span>
            <span className="ml-auto text-[10px] font-mono opacity-60 group-hover/link:opacity-100 transition-opacity">
              open docs →
            </span>
          </a>
        </div>
      </div>
    </motion.div>
  );
}
