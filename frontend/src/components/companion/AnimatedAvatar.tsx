import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import AvatarClip, { type ClipName } from './AvatarClip';
import './AnimatedAvatar.css';

export type AvatarMode = 'idle' | 'talk' | 'think' | 'celebrate' | 'climb' | 'drop';
export type AvatarSize = 'small' | 'medium' | 'large' | number;
export type ReducedMotionBehavior = 'static' | 'minimal';

interface Props {
  mode?: AvatarMode;
  size?: AvatarSize;
  interactive?: boolean;
  label?: string;
  className?: string;
  onActivate?: () => void;
  onAnimationEnd?: (mode: AvatarMode) => void;
  reducedMotionBehavior?: ReducedMotionBehavior;
}

const SIZE_PX: Record<Exclude<AvatarSize, number>, number> = {
  small: 64,
  medium: 116,
  large: 160,
};

const MODE_CLIP: Record<AvatarMode, ClipName> = {
  idle: 'idle',
  talk: 'talk',
  think: 'think',
  celebrate: 'celebrate',
  climb: 'celebrate',
  drop: 'think',
};

const MODE_FALLBACK: Record<AvatarMode, string> = {
  idle: '/companion/neurostep-bot.png',
  talk: '/companion/neurostep-bot-talk.png',
  think: '/companion/neurostep-bot-think.png',
  celebrate: '/companion/neurostep-bot-celebrate.png',
  climb: '/companion/neurostep-bot-celebrate.png',
  drop: '/companion/neurostep-bot-think.png',
};

export default function AnimatedAvatar({
  mode = 'idle',
  size = 'medium',
  interactive = false,
  label = 'Avatar',
  className = '',
  onActivate,
  onAnimationEnd,
  reducedMotionBehavior = 'static',
}: Props) {
  const [videoOk, setVideoOk] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(query.matches);
    updatePreference();
    query.addEventListener('change', updatePreference);
    return () => query.removeEventListener('change', updatePreference);
  }, []);

  const pixelSize = typeof size === 'number' ? Math.max(1, size) : SIZE_PX[size];
  const style = { '--animated-avatar-size': `${pixelSize}px` } as CSSProperties;
  const showStatic = !videoOk || (prefersReducedMotion && reducedMotionBehavior === 'static');
  const clip = prefersReducedMotion && reducedMotionBehavior === 'minimal'
    ? 'idle'
    : MODE_CLIP[mode];

  const avatar = useMemo(() => {
    if (showStatic) {
      return <img className="animated-avatar__image" src={MODE_FALLBACK[mode]} alt="" />;
    }

    return (
      <AvatarClip
        clip={clip}
        className="animated-avatar__clip"
        onEnded={() => onAnimationEnd?.(mode)}
        onFail={() => setVideoOk(false)}
      />
    );
  }, [clip, mode, onAnimationEnd, showStatic]);

  const classes = `animated-avatar ${interactive ? 'animated-avatar--interactive' : ''} ${className}`.trim();

  if (interactive) {
    return (
      <button type="button" className={classes} style={style} onClick={onActivate} aria-label={label}>
        {avatar}
      </button>
    );
  }

  return (
    <div className={classes} style={style} role="presentation" aria-hidden="true" tabIndex={-1}>
      {avatar}
    </div>
  );
}
