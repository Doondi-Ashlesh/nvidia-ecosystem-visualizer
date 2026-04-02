'use client';

/**
 * ServiceNode — custom React Flow node (hex shape, glassmorphism, NVIDIA green)
 *
 * Visual states:
 *   default    — visible, subtle green border
 *   dimmed     — desaturated & ~40% opacity (still legible, just de-emphasised)
 *   highlighted — bright green border + soft glow
 *   activeStep  — bright glow + pulsing radial overlay
 */

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { Service, ServiceNodeData } from '@/types/ecosystem';

const GREEN    = '#76b900';
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
const NODE_W   = 180;
const NODE_H   = 100;

function ServiceNodeComponent({ data }: NodeProps) {
  const {
    service,
    stepNumber,
    isHighlighted,
    isDimmed,
    isActiveStep,
    onHover,
    onClick,
    onMouseMove,
  } = data as ServiceNodeData & {
    onMouseMove?: (service: Service, x: number, y: number) => void;
  };

  const [hovered, setHovered] = useState(false);

  // ── Visual state ─────────────────────────────────────────────────────────
  const borderColor = isActiveStep
    ? GREEN
    : isHighlighted
    ? `${GREEN}cc`
    : hovered
    ? `${GREEN}55`
    : '#1e293b';

  const bgColor = isActiveStep || isHighlighted
    ? `${GREEN}12`
    : hovered
    ? `${GREEN}08`
    : 'rgba(8, 8, 8, 0.88)';

  const glowFilter = isActiveStep
    ? `drop-shadow(0 0 14px ${GREEN}) drop-shadow(0 0 28px ${GREEN}80)`
    : isHighlighted
    ? `drop-shadow(0 0 8px ${GREEN}70)`
    : hovered
    ? `drop-shadow(0 0 6px ${GREEN}45)`
    : 'none';

  return (
    <motion.div
      style={{ width: NODE_W + 4, height: NODE_H + 4 }}
      className="relative cursor-pointer select-none"
      animate={{
        // Dimmed: still visible at ~40%, slightly desaturated — not invisible
        opacity: isDimmed ? 0.40 : 1,
        filter:  isDimmed ? 'grayscale(0.6) brightness(0.55)' : glowFilter,
        scale:   hovered && !isDimmed ? 1.06 : 1,
      }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onMouseEnter={(e) => {
        setHovered(true);
        (onHover as (s: Service | null) => void)(service);
        (onMouseMove as ((s: Service, x: number, y: number) => void) | undefined)?.(
          service, e.clientX, e.clientY,
        );
      }}
      onMouseMove={(e) => {
        (onMouseMove as ((s: Service, x: number, y: number) => void) | undefined)?.(
          service, e.clientX, e.clientY,
        );
      }}
      onMouseLeave={() => {
        setHovered(false);
        (onHover as (s: Service | null) => void)(null);
      }}
      onClick={() => (onClick as (s: Service) => void)(service)}
    >
      {/* Active-step radial pulse */}
      {isActiveStep && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ clipPath: HEX_CLIP }}
          animate={{ opacity: [0.25, 0.65, 0.25] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="w-full h-full"
            style={{
              background: `radial-gradient(ellipse at center, ${GREEN}35 0%, transparent 68%)`,
            }}
          />
        </motion.div>
      )}

      {/* Outer hex — acts as border */}
      <div
        className="absolute inset-0"
        style={{ clipPath: HEX_CLIP, background: borderColor }}
      />

      {/* Inner hex — glassmorphism content */}
      <div
        className="absolute flex flex-col items-center justify-center gap-0.5"
        style={{
          top: 2, left: 4, right: 4, bottom: 2,
          clipPath:             HEX_CLIP,
          background:           bgColor,
          backdropFilter:       'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <span className="text-[12px] font-bold text-white text-center leading-tight px-8 line-clamp-2">
          {service.name}
        </span>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: `${GREEN}bb` }}
        >
          {service.tags[0]}
        </span>
      </div>

      {/* Step number badge */}
      {stepNumber !== undefined && (
        <div
          className="absolute -top-1.5 -right-1.5 w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] font-black z-20"
          style={{
            background: isActiveStep ? GREEN : '#0d1117',
            color:      isActiveStep ? '#000' : GREEN,
            border:     `1.5px solid ${GREEN}`,
            boxShadow:  isActiveStep ? `0 0 10px ${GREEN}` : 'none',
          }}
        >
          {stepNumber}
        </div>
      )}

      {/* React Flow handles — invisible */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: 'transparent', border: 'none', width: 6, height: 6, left: 2 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: 'transparent', border: 'none', width: 6, height: 6, right: 2 }}
      />
    </motion.div>
  );
}

export default memo(ServiceNodeComponent);
