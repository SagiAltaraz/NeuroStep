import { useId } from "react";

interface LogoProps {
  height?: number;
  withText?: boolean;
  tone?: "light" | "dark";
}

export default function Logo({ height = 32, withText = true, tone = "light" }: LogoProps) {
  const id = useId();
  const mark = height * 1.25;
  const neuro = tone === "dark" ? "#ffffff" : "#1c3a45";
  const step = tone === "dark" ? "#6cc4ff" : "#2f86d6";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: height * 0.34 }}>
      <svg width={mark} height={mark} viewBox="0 0 48 48" aria-label="NeuroStep" role="img">
        <defs>
          <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#66bcc4" />
            <stop offset="0.5" stopColor="#3f9fcf" />
            <stop offset="1" stopColor="#2f86d6" />
          </linearGradient>
        </defs>
        <circle cx="36" cy="14" r="12.5" fill="none" stroke={`url(#${id})`} strokeWidth="1" opacity="0.22" />
        <circle cx="36" cy="14" r="8.5" fill="none" stroke={`url(#${id})`} strokeWidth="1.2" opacity="0.4" />
        <polyline
          points="12,37 24,25.5 36,14"
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="37" r="3.6" fill={`url(#${id})`} />
        <circle cx="24" cy="25.5" r="4.6" fill={`url(#${id})`} />
        <circle cx="36" cy="14" r="6" fill={`url(#${id})`} />
      </svg>
      {withText && (
        <span
          style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: height,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          <span style={{ color: neuro }}>Neuro</span>
          <span style={{ color: step }}>Step</span>
        </span>
      )}
    </span>
  );
}
