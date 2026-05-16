/**
 * useCardTilt — cursor-driven 3D tilt for game/problem cards.
 *
 * Tracks the cursor's relative position inside a card and returns spring-
 * smoothed motion values for:
 *   • Subtle card rotation (rotateX / rotateY)
 *   • A more dramatic emoji rotation (the emoji is the visual hero)
 *   • A cursor-following glow position (% strings for left/top)
 *
 * Pair the returned ref + handlers with the consumer's interactive element.
 * Apply `transformPerspective` on the card and `transform-style: preserve-3d`
 * on the card (and any parent that holds Z-shifted children) in CSS.
 */
import { useRef } from 'react';
import {
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';

interface UseCardTiltOptions {
  enabled?:     boolean;   // disable for coming-soon / reduced motion
  cardMaxDeg?:  number;    // max card tilt (default 7°)
  emojiMaxDeg?: number;    // max emoji tilt (default 22°)
}

export interface UseCardTiltResult<T extends HTMLElement> {
  ref:          React.RefObject<T | null>;
  onMouseMove:  (e: React.MouseEvent<T>) => void;
  onMouseLeave: () => void;
  cardRotX:     MotionValue<number>;
  cardRotY:     MotionValue<number>;
  emojiRotX:    MotionValue<number>;
  emojiRotY:    MotionValue<number>;
  glowX:        MotionValue<string>;
  glowY:        MotionValue<string>;
}

export function useCardTilt<T extends HTMLElement = HTMLElement>(
  { enabled = true, cardMaxDeg = 7, emojiMaxDeg = 22 }: UseCardTiltOptions = {},
): UseCardTiltResult<T> {
  const ref = useRef<T>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const spring = { stiffness: 220, damping: 22, mass: 0.4 };
  const sx = useSpring(mx, spring);
  const sy = useSpring(my, spring);

  const cardRotX  = useTransform(sy, [-0.5, 0.5], [ cardMaxDeg,  -cardMaxDeg ]);
  const cardRotY  = useTransform(sx, [-0.5, 0.5], [-cardMaxDeg,   cardMaxDeg ]);
  const emojiRotX = useTransform(sy, [-0.5, 0.5], [ emojiMaxDeg, -emojiMaxDeg]);
  const emojiRotY = useTransform(sx, [-0.5, 0.5], [-emojiMaxDeg,  emojiMaxDeg]);
  const glowX     = useTransform(sx, [-0.5, 0.5], ['25%', '75%']);
  const glowY     = useTransform(sy, [-0.5, 0.5], ['25%', '75%']);

  const onMouseMove = (e: React.MouseEvent<T>) => {
    if (!enabled) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set((e.clientX - rect.left) / rect.width  - 0.5);
    my.set((e.clientY - rect.top)  / rect.height - 0.5);
  };

  const onMouseLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return { ref, onMouseMove, onMouseLeave, cardRotX, cardRotY, emojiRotX, emojiRotY, glowX, glowY };
}
