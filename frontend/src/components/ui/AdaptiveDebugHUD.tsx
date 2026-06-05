/**
 * AdaptiveDebugHUD — a live on-screen overlay that shows the adaptive engine
 * working in real time: connection status, difficulty level D, performance
 * score P, accuracy, and the last difficulty change.
 *
 * Drop it into any game page:
 *   const { isConnected, telemetry, lastAdjustment } = useGameSession('shapes-click');
 *   <AdaptiveDebugHUD isConnected={isConnected} telemetry={telemetry} lastAdjustment={lastAdjustment} />
 *
 * It's a diagnostic aid — remove (or gate behind a flag) before shipping to users.
 */

import type { AdaptiveTelemetry, AdaptiveAdjustment } from '../../hooks/useGameSession';

interface Props {
  isConnected:    boolean;
  telemetry:      AdaptiveTelemetry | null;
  lastAdjustment: AdaptiveAdjustment | null;
}

const panel: React.CSSProperties = {
  position: 'fixed', bottom: 16, left: 16, zIndex: 9999,
  direction: 'ltr', width: 248, padding: '12px 14px',
  background: 'rgba(15,23,42,0.92)', color: '#e2e8f0',
  border: '1px solid #3730a3', borderRadius: 12,
  font: '12px/1.5 ui-monospace, Menlo, monospace',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)', pointerEvents: 'none',
};

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div style={{ margin: '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
        <span>{label}</span><span style={{ color }}>{pct}%</span>
      </div>
      <div style={{ height: 7, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .35s ease' }} />
      </div>
    </div>
  );
}

export default function AdaptiveDebugHUD({ isConnected, telemetry, lastAdjustment }: Props) {
  const arrow = lastAdjustment?.direction === 'harder' ? '▲ harder'
              : lastAdjustment?.direction === 'easier' ? '▼ easier' : '';

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontWeight: 700 }}>
        <span style={{
          width: 9, height: 9, borderRadius: '50%',
          background: isConnected ? '#22c55e' : '#ef4444',
          boxShadow: `0 0 8px ${isConnected ? '#22c55e' : '#ef4444'}`,
        }} />
        <span style={{ color: '#a5b4fc' }}>ADAPTIVE ENGINE</span>
        <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
          {isConnected ? 'live' : 'offline'}
        </span>
      </div>

      {!isConnected && (
        <div style={{ color: '#fca5a5' }}>
          לא מחובר לשרת ‎(ws:3001)‎ — אין התאמה
        </div>
      )}

      {isConnected && !telemetry && (
        <div style={{ color: '#94a3b8' }}>אוסף נתונים… שחק כמה סבבים</div>
      )}

      {telemetry && (
        <>
          <Bar label={`difficulty D`} value={telemetry.D} color="#818cf8" />
          <Bar label={`performance P`} value={telemetry.P ?? 0} color="#34d399" />
          <Bar label={`accuracy`} value={telemetry.accuracy} color="#fbbf24" />
          <div style={{ color: '#64748b', marginTop: 4 }}>
            events: {telemetry.events} · target P ≈ 72%
          </div>
        </>
      )}

      {lastAdjustment && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>change #{lastAdjustment.count}</span>
            <span style={{ color: lastAdjustment.direction === 'harder' ? '#f87171' : '#4ade80' }}>{arrow}</span>
          </div>
          <div style={{ color: '#cbd5e1', fontSize: 11, marginTop: 2 }}>
            {Object.entries(lastAdjustment.params)
              .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`)
              .join('  ')}
          </div>
        </div>
      )}
    </div>
  );
}
