/**
 * Avatar — the journey-map mascot that reacts to progression.
 *
 * One component, four states (from the progression engine's AvatarState):
 *   idle      → gentle bob (default, resting on the map)
 *   climb     → eager upward hops (a domain leveled up)
 *   drop      → slow downward sag (a domain demoted)
 *   celebrate → big jump + spin + sparkles (a notable level-up moment)
 *
 * Used in the end-of-session level-up banner (F2) and the /journey map (F4).
 * Emoji-based, no assets — motion carries the state.
 */
import { motion, type Variants } from 'framer-motion';
import type { AvatarState } from '../../hooks/useGameSession';

interface Props {
  state?:     AvatarState;
  size?:      number;   // px — the mascot's font size
  className?: string;
}

const variants: Variants = {
  idle: {
    y: [0, -4, 0],
    rotate: 0,
    transition: { repeat: Infinity, duration: 2.2, ease: 'easeInOut' },
  },
  climb: {
    y: [0, -12, 0],
    rotate: [0, -7, 0],
    transition: { repeat: Infinity, duration: 0.85, ease: 'easeInOut' },
  },
  drop: {
    y: [0, 7, 0],
    rotate: [0, 5, 0],
    transition: { repeat: Infinity, duration: 1.7, ease: 'easeInOut' },
  },
  celebrate: {
    y: [0, -16, 0],
    rotate: [0, -14, 14, 0],
    scale: [1, 1.12, 1],
    transition: { repeat: Infinity, duration: 1.15, ease: 'easeInOut' },
  },
};

// A soft glow tint per state — reinforces the emotional read.
const GLOW: Record<AvatarState, string> = {
  idle:      'drop-shadow(0 4px 8px rgba(99,102,241,0.25))',   // indigo
  climb:     'drop-shadow(0 6px 12px rgba(16,185,129,0.45))',  // emerald
  drop:      'drop-shadow(0 6px 12px rgba(148,163,184,0.45))', // slate
  celebrate: 'drop-shadow(0 8px 16px rgba(245,158,11,0.55))',  // amber
};

export default function Avatar({ state = 'idle', size = 56, className = '' }: Props) {
  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`avatar-${state}`}
    >
      {/* Sparkles — only while celebrating */}
      {state === 'celebrate' && (
        <>
          <Sparkle delay={0}   x={-size * 0.5} y={-size * 0.3} />
          <Sparkle delay={0.4} x={size * 0.5}  y={-size * 0.1} />
          <Sparkle delay={0.8} x={0}           y={-size * 0.6} />
        </>
      )}
      <motion.span
        key={state}            // re-trigger the animation when the state changes
        variants={variants}
        animate={state}
        style={{ fontSize: size, lineHeight: 1, filter: GLOW[state] }}
      >
        🧠
      </motion.span>
    </span>
  );
}

function Sparkle({ delay, x, y }: { delay: number; x: number; y: number }) {
  return (
    <motion.span
      className="pointer-events-none absolute text-amber-400"
      style={{ left: '50%', top: '50%', fontSize: 16 }}
      initial={{ opacity: 0, scale: 0, x, y }}
      animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0], x, y }}
      transition={{ repeat: Infinity, duration: 1.4, delay, ease: 'easeOut' }}
    >
      ✨
    </motion.span>
  );
}
