/**
 * LumaClip — transparent-video playback for Safari via a luma matte.
 *
 * Safari can't play VP9+alpha WebM, and this Mac's VideoToolbox refuses to
 * encode HEVC+alpha (kVTPropertyNotSupportedErr), so a plain HEVC .mp4 came out
 * opaque. Instead Safari gets a normal, opaque H.264 .mp4 laid out as a "luma
 * matte": premultiplied colour on the top half, the alpha mask as luminance on
 * the bottom half. A tiny WebGL shader samples both halves every frame and
 * outputs real RGBA onto a canvas — transparency that works in every browser.
 *
 * Only Safari uses this path (AvatarClip branches on the engine); Chrome/Firefox
 * keep the untouched <video> WebM path. Single buffer with a CSS opacity fade on
 * clip change — the hub-pose design keeps the cut at the boundary invisible.
 */
import { useEffect, useRef } from 'react';
import type { ClipName } from './AvatarClip';

const LOOPING: Record<ClipName, boolean> = {
   idle: true, talk: true, think: true, 'jet-cruise': true,
   celebrate: false, 'jet-launch': false, 'jet-land': false,
};

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = vec2((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5); // 0,0 = top-left
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// colour = top half (premultiplied), alpha = bottom half (matte luminance).
const FRAG = `
precision mediump float;
varying vec2 uv;
uniform sampler2D tex;
void main() {
  vec3 rgb = texture2D(tex, vec2(uv.x, uv.y * 0.5)).rgb;
  float a  = texture2D(tex, vec2(uv.x, uv.y * 0.5 + 0.5)).r;
  gl_FragColor = vec4(rgb, a); // premultiplied — matches canvas premultipliedAlpha
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
   const s = gl.createShader(type)!;
   gl.shaderSource(s, src);
   gl.compileShader(s);
   return s;
}

interface Props {
   clip: ClipName;
   className?: string;
   playbackRate?: number;
   onEnded?: (clip: ClipName) => void;
   onFail?: () => void;
}

export default function LumaClip({ clip, className, playbackRate = 1, onEnded, onFail }: Props) {
   const canvasRef = useRef<HTMLCanvasElement>(null);
   const videoRef = useRef<HTMLVideoElement | null>(null);
   const rafRef = useRef<number>(0);
   const disposed = useRef(false);
   const onEndedRef = useRef(onEnded);
   onEndedRef.current = onEnded;

   // One-time GL + video setup; the clip src is swapped in a separate effect.
   useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      disposed.current = false;
      const gl = canvas.getContext('webgl', {
         premultipliedAlpha: true,
         alpha: true,
         antialias: true,
      });
      // eslint-disable-next-line no-console
      if (!gl) { console.warn('[LumaClip] no WebGL context'); onFail?.(); return; }

      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      videoRef.current = video;

      video.addEventListener('ended', () => {
         const name = video.dataset.clip as ClipName | undefined;
         if (name && !LOOPING[name]) onEndedRef.current?.(name);
      });
      video.addEventListener('error', () => {
         // Ignore the synthetic "Empty src" error from teardown / before a clip
         // is assigned; only a real decode/network failure on a live src counts.
         if (disposed.current || !video.getAttribute('src')) return;
         if (video.error) onFail?.();
      });

      const draw = () => {
         if (video.readyState >= 2) {
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
         }
         rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);

      return () => {
         disposed.current = true;
         cancelAnimationFrame(rafRef.current);
         video.pause();
         video.removeAttribute('src');
         videoRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   // Swap the clip: fade the canvas out, point the video at the new luma file,
   // play from the top, fade back in. The hub pose hides the cut.
   useEffect(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      if (video.dataset.clip === clip) return;

      canvas.style.opacity = '0';
      video.dataset.clip = clip;
      video.loop = LOOPING[clip];
      video.playbackRate = playbackRate;
      video.src = `/companion/anim/${clip}.mp4`;
      video.currentTime = 0;
      const onReady = () => {
         video.playbackRate = playbackRate;
         video.play().catch(() => {});
         canvas.style.opacity = '1';
      };
      video.addEventListener('loadeddata', onReady, { once: true });
      video.load();
      return () => video.removeEventListener('loadeddata', onReady);
   }, [clip, playbackRate]);

   return (
      <div className={className}>
         <canvas
            ref={canvasRef}
            width={512}
            height={512}
            style={{
               position: 'absolute',
               inset: 0,
               width: '100%',
               height: '100%',
               transition: 'opacity 320ms ease',
            }}
            aria-hidden="true"
         />
      </div>
   );
}
