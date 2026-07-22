/**
 * AvatarClip — the companion's transparent-video player.
 *
 * Plays the mascot's animation clips (WebM+alpha for Chrome/Firefox, HEVC
 * MOV+alpha for Safari/iOS) with an A/B double-buffer: the requested clip is
 * loaded into the hidden <video>, and only once it can play do we cross-fade
 * (FADE_MS) and swap. Every clip starts/ends on the shared "hub pose", so the
 * short fade is all it takes to hide the seam between generated clips.
 *
 * One-shot clips fire onEnded so the parent state machine can chain
 * (celebrate → idle, jet-launch → jet-cruise, jet-land → open chat).
 * If the browser can't play either format, onFail lets the parent fall back
 * to the static PNG poses.
 *
 * Browser split: Safari can't play VP9+alpha WebM and this toolchain can't make
 * HEVC+alpha, so Safari renders a luma-matte .mp4 through a WebGL canvas
 * (LumaClip). Chrome/Firefox keep this untouched WebM <video> path with its A/B
 * double-buffer. The engine is detected once and the whole renderer is chosen
 * accordingly — no ambiguous <source> lists.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import LumaClip from './LumaClip';

// Safari (macOS + iOS) reports vendor "Apple Computer, Inc."; Chrome/Edge/
// Firefox do not. `localStorage.luma = '1'` forces the Safari luma path for
// testing the WebGL renderer in any browser.
const IS_SAFARI =
   (typeof navigator !== 'undefined' && /apple/i.test(navigator.vendor ?? '')) ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('luma') === '1');

export type ClipName =
   | 'idle'
   | 'talk'
   | 'think'
   | 'celebrate'
   | 'jet-launch'
   | 'jet-cruise'
   | 'jet-land';

const LOOPING: Record<ClipName, boolean> = {
   idle: true,
   talk: true,
   think: true,
   'jet-cruise': true,
   celebrate: false,
   'jet-launch': false,
   'jet-land': false,
};

// Long enough to melt the small pose differences between generated clips,
// short enough to feel responsive. Must match the CSS opacity transition.
const FADE_MS = 320;

interface Props {
   clip: ClipName;
   className?: string;
   playbackRate?: number;
   onEnded?: (clip: ClipName) => void;
   onFail?: () => void;
}

export default function AvatarClip(props: Props) {
   // Safari has no alpha-video path — render the luma-matte via WebGL instead.
   if (IS_SAFARI) return <LumaClip {...props} />;
   return <WebmClip {...props} />;
}

// Chrome/Firefox path: WebM+alpha in a straightforward A/B <video> buffer.
function WebmClip({ clip, className, playbackRate = 1, onEnded, onFail }: Props) {
   // Two buffers; `active` is the visible one, the other stages the next clip.
   const [slots, setSlots] = useState<(ClipName | null)[]>([clip, null]);
   const [active, setActive] = useState(0);
   const vidA = useRef<HTMLVideoElement>(null);
   const vidB = useRef<HTMLVideoElement>(null);
   const realFailures = useRef(0);
   const refs = [vidA, vidB];

   useEffect(() => {
      if (vidA.current) vidA.current.playbackRate = playbackRate;
      if (vidB.current) vidB.current.playbackRate = playbackRate;
   }, [playbackRate]);

   const swapTo = useCallback(
      (idx: number) => {
         const vid = refs[idx === 0 ? 0 : 1].current;
         if (!vid) return;
         vid.playbackRate = playbackRate;
         try { vid.currentTime = 0; } catch { /* not seekable yet */ }
         vid.play().catch(() => {});
         setActive(idx);
         const old = refs[idx === 0 ? 1 : 0].current;
         setTimeout(() => old?.pause(), FADE_MS + 60);
      },
      // refs are stable
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [playbackRate],
   );

   // A new clip was requested → stage it in the hidden buffer, or — if that
   // buffer already holds this clip from an earlier cycle (same key, so no
   // remount and no fresh loadeddata event) — swap to it right away.
   useEffect(() => {
      if (slots[active] === clip) return;
      const hidden = 1 - active;
      if (slots[hidden] === clip) {
         const vid = refs[hidden].current;
         if (vid && vid.readyState >= 2) swapTo(hidden);
         else vid?.load(); // reload → loadeddata → handleReady swaps
         return;
      }
      setSlots((s) => {
         const next = [...s];
         next[hidden] = clip;
         return next;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [clip, active, slots]);

   const handleReady = (idx: number) => {
      realFailures.current = 0; // a working load proves video support
      if (idx === active || slots[idx] !== clip) return;
      swapTo(idx);
   };

   const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      // Only element-level failures matter (video.error set). Anything else —
      // e.g. transient events while a buffer is re-staged — is benign.
      if (!e.currentTarget.error) return;
      realFailures.current += 1;
      if (realFailures.current >= 2) onFail?.();
   };

   return (
      <div className={className}>
         {refs.map((ref, i) => {
            const name = slots[i];
            return (
               <video
                  key={`${i}-${name ?? 'empty'}`}
                  ref={ref}
                  muted
                  playsInline
                  preload="auto"
                  src={name ? `/companion/anim/${name}.webm` : undefined}
                  loop={name ? LOOPING[name] : false}
                  autoPlay={i === active}
                  style={{ opacity: i === active ? 1 : 0 }}
                  onLoadedData={() => handleReady(i)}
                  onEnded={() => name && !LOOPING[name] && onEnded?.(name)}
                  onError={handleError}
                  aria-hidden={i !== active}
               />
            );
         })}
      </div>
   );
}
