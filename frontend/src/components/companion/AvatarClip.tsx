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
 * Format selection is done ONCE per session by browser, not via a <source>
 * list: Safari (the only engine with HEVC+alpha but no VP9+alpha) gets the
 * .mp4, everything else gets the .webm. A <source> list is ambiguous here —
 * Chrome on Macs with hardware HEVC will happily pick the mp4 and render the
 * alpha as black, and Safari can pick the webm with the same result.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// Safari (macOS + iOS) reports vendor "Apple Computer, Inc."; Chrome/Edge/
// Firefox do not. This is the discriminator for the alpha-capable format.
const IS_SAFARI =
   typeof navigator !== 'undefined' && /apple/i.test(navigator.vendor ?? '');
const clipSrc = (name: ClipName) =>
   `/companion/anim/${name}.${IS_SAFARI ? 'mp4' : 'webm'}`;

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
   onEnded?: (clip: ClipName) => void;
   onFail?: () => void;
}

export default function AvatarClip({ clip, className, onEnded, onFail }: Props) {
   // Two buffers; `active` is the visible one, the other stages the next clip.
   const [slots, setSlots] = useState<(ClipName | null)[]>([clip, null]);
   const [active, setActive] = useState(0);
   const vidA = useRef<HTMLVideoElement>(null);
   const vidB = useRef<HTMLVideoElement>(null);
   const realFailures = useRef(0);
   const refs = [vidA, vidB];

   const swapTo = useCallback(
      (idx: number) => {
         const vid = refs[idx === 0 ? 0 : 1].current;
         if (!vid) return;
         try { vid.currentTime = 0; } catch { /* not seekable yet */ }
         vid.play().catch(() => {});
         setActive(idx);
         const old = refs[idx === 0 ? 1 : 0].current;
         setTimeout(() => old?.pause(), FADE_MS + 60);
      },
      // refs are stable
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
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
                  src={name ? clipSrc(name) : undefined}
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
