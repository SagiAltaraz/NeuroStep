import { useRef, useEffect } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export default function SiteBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;

    let w = 0, h = 0, dpr = 1;
    let nodes: Node[] = [];
    let raf: number;
    const mouse = { x: -9999, y: -9999 };

    const init = () => {
      const n = Math.round(Math.min(160, (w * h) / 13000));
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
      }));
    };

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      init();
    };

    const LINK = 135, MLINK = 185;

    const tick = () => {
      ctx.clearRect(0, 0, w, h);

      for (const p of nodes) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < 120 && d > 0.01) { p.x += dx / d * 0.5; p.y += dy / d * 0.5; }
      }

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(95,166,182,${(1 - d / LINK) * 0.32})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        const md = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (md < MLINK) {
          ctx.strokeStyle = `rgba(47,134,214,${(1 - md / MLINK) * 0.5})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }

      for (const p of nodes) {
        ctx.fillStyle = "rgba(74,141,205,.72)";
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 6.2832); ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };

    const move = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const leave = () => { mouse.x = mouse.y = -9999; };

    addEventListener("resize", resize);
    addEventListener("mousemove", move);
    addEventListener("mouseout", leave);
    resize();
    tick();

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("mousemove", move);
      removeEventListener("mouseout", leave);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        background:
          "radial-gradient(60vw 56vw at 14% 18%,rgba(143,179,224,.5),transparent 70%)," +
          "radial-gradient(62vw 58vw at 90% 16%,rgba(150,205,210,.52),transparent 72%)," +
          "radial-gradient(66vw 62vw at 78% 98%,rgba(176,222,206,.5),transparent 70%)," +
          "radial-gradient(52vw 48vw at 24% 100%,rgba(190,216,238,.55),transparent 70%),#f3faf9",
      }}
    >
      <canvas
        ref={ref}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
