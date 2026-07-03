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
 * NOTE on error handling: browsers fire an `error` event every time they SKIP
 * an unsupported <source> (e.g. Chrome skipping the HEVC MOV on its way to the
 * WebM). Those are benign — the element-level `video.error` stays null. Only a
 * non-null MediaError means the whole buffer truly failed; that is the only
 * signal we count toward the PNG fallback, and any successful load resets it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

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

const FADE_MS = 180;

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
      const v = e.currentTarget;
      // Benign source-skip (e.g. Chrome passing over the HEVC MOV): the element
      // keeps loading and video.error stays null — ignore it.
      if (!v.error) return;
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
                  loop={name ? LOOPING[name] : false}
                  autoPlay={i === active}
                  style={{ opacity: i === active ? 1 : 0 }}
                  onLoadedData={() => handleReady(i)}
                  onEnded={() => name && !LOOPING[name] && onEnded?.(name)}
                  onError={handleError}
                  aria-hidden={i !== active}
               >
                  {name && (
                     <>
                        {/* Safari picks the HEVC+alpha MOV; Chrome/Firefox skip
                            quicktime and take the VP9+alpha WebM. */}
                        <source src={`/companion/anim/${name}.mov`} type="video/quicktime" />
                        <source src={`/companion/anim/${name}.webm`} type="video/webm" />
                     </>
                  )}
               </video>
            );
         })}
      </div>
   );
}
