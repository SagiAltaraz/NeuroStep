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
 */
import { useEffect, useRef, useState } from 'react';

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
   // Two buffers; `active` is the visible one, the other preloads the next clip.
   const [slots, setSlots] = useState<(ClipName | null)[]>([clip, null]);
   const [active, setActive] = useState(0);
   const vidA = useRef<HTMLVideoElement>(null);
   const vidB = useRef<HTMLVideoElement>(null);
   const errors = useRef(0);

   const refs = [vidA, vidB];

   // A new clip was requested → stage it in the hidden buffer.
   useEffect(() => {
      if (slots[active] === clip) return;
      const hidden = 1 - active;
      setSlots((s) => {
         const next = [...s];
         next[hidden] = clip;
         return next;
      });
      // the swap happens in handleReady once the hidden video can play
   }, [clip, active, slots]);

   const handleReady = (idx: number) => {
      // Swap only when the buffer that just became ready holds the requested clip.
      if (idx === active || slots[idx] !== clip) return;
      const vid = refs[idx].current;
      vid?.play().catch(() => {});
      setActive(idx);
      // pause the old buffer after the fade completes (saves CPU)
      const old = refs[1 - idx].current;
      setTimeout(() => old?.pause(), FADE_MS + 60);
   };

   const handleError = () => {
      // Both sources of a buffer failed → count; two dead buffers = no video support.
      errors.current += 1;
      if (errors.current >= 2) onFail?.();
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
