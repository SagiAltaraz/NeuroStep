import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import './AlertsPage.css';

// ─── Types ────────────────────────────────────────────────────────

type GameId = 'shapes-click' | 'color-trains' | 'tictactoe' | 'memory';

interface Alert {
  alertId:      string | null;
  userId:       string;
  displayName:  string | null;
  gameId:       GameId;
  type:         string;
  trigger:      'accuracy' | 'cognitive_score' | null;
  accuracyDrop: number | null;
  createdAt:    number | null;
  acknowledged: boolean;
}

interface AlertConfig {
  accuracyDropPct: number;
  scoreDrop:       number;
  windowSessions:  number;
}

const GAME_LABELS_HE: Record<GameId, string> = {
  'shapes-click': 'איתור צורות',
  'color-trains': 'רכבות צבעוניות',
  'tictactoe':    'איקס עיגול',
  'memory':       'זיכרון',
};

// ─── Helpers ──────────────────────────────────────────────────────

function relativeTime(ts: number | null): string {
  if (ts === null) return '—';
  const diff = Date.now() - ts;
  const min  = Math.round(diff / 60_000);
  const hr   = Math.round(diff / 3_600_000);
  const day  = Math.round(diff / 86_400_000);
  if (min < 1)  return 'לפני רגע';
  if (min < 60) return `לפני ${min} דקות`;
  if (hr  < 24) return hr === 1 ? 'לפני שעה' : `לפני ${hr} שעות`;
  if (day === 1) return 'לפני יום';
  if (day === 2) return 'לפני יומיים';
  if (day < 30)  return `לפני ${day} ימים`;
  return new Date(ts).toLocaleDateString('he-IL');
}

function triggerText(alert: Alert): string {
  if (alert.trigger === 'accuracy') {
    const drop = alert.accuracyDrop ?? 0;
    return `ירידה של ${drop} נקודות באחוזי דיוק לאורך 3 משחקים`;
  }
  if (alert.trigger === 'cognitive_score') {
    return 'ציון קוגניטיבי ירד בעקביות לאורך 3 משחקים';
  }
  return 'דפוס ירידה זוהה לאורך 3 משחקים';
}

// ─── Component ────────────────────────────────────────────────────

export default function AlertsPage() {
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [alerts,    setAlerts]    = useState<Alert[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [busyKey,   setBusyKey]   = useState<string | null>(null);

  // Alert-sensitivity thresholds (admin/alertConfig), editable here.
  const [cfg,       setCfg]       = useState<AlertConfig | null>(null);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgStatus, setCfgStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  if (!isAdmin) return <Navigate to="/" />;

  const fetchAlerts = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/alerts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Alert[];
      setAlerts(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    // Refetch when the tab regains focus (covers another admin acking the same alert elsewhere)
    const onFocus = () => fetchAlerts();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load the alert-threshold config once.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/admin/alert-config', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setCfg(d as AlertConfig); })
      .catch(() => {/* non-fatal */});
    return () => { cancelled = true; };
  }, [token]);

  const saveConfig = async () => {
    if (!token || !cfg) return;
    setCfgSaving(true);
    setCfgStatus('idle');
    try {
      const res = await fetch('/api/admin/alert-config', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ accuracyDropPct: cfg.accuracyDropPct, scoreDrop: cfg.scoreDrop }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.config) setCfg(json.config as AlertConfig);   // reflect server clamping
      setCfgStatus('saved');
    } catch {
      setCfgStatus('error');
    } finally {
      setCfgSaving(false);
    }
  };

  const acknowledge = async (alert: Alert) => {
    if (!alert.alertId) return;
    const key = `${alert.userId}_${alert.gameId}`;
    setBusyKey(key);

    // Optimistic remove
    const prev = alerts;
    setAlerts(prev.filter(a => `${a.userId}_${a.gameId}` !== key));

    try {
      const res = await fetch('/api/admin/alerts/acknowledge', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId:  alert.userId,
          gameId:  alert.gameId,
          alertId: alert.alertId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Restore on failure (idempotent across tabs — second ack is harmless)
      console.warn('[AlertsPage] acknowledge failed, restoring:', err);
      setAlerts(prev);
      setError('הפעולה נכשלה — נסה שוב');
    } finally {
      setBusyKey(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  const Header = (
    <div className="alerts-header">
      <div>
        <h1>
          אזעקות פעילות
          {alerts.length > 0 && <span className="alerts-count">{alerts.length}</span>}
        </h1>
        <p className="alerts-subtitle">
          התרעות על דפוסי ירידה בביצועים — לבדיקה על־ידי המטפל
        </p>
      </div>
      <button className="alerts-back-btn" onClick={() => navigate(-1)}>
        <ChevronRight size={14} />
        חזור
      </button>
    </div>
  );

  const ConfigPanel = cfg && (
    <section className="alert-config" dir="rtl">
      <h2 className="alert-config-title">ספי רגישות להתראה</h2>
      <p className="alert-config-sub">
        התראה נפתחת כשמזוהה ירידה על פני {cfg.windowSessions} משחקים רצופים ומעבר לספים הבאים.
      </p>
      <div className="alert-config-fields">
        <label className="alert-config-field">
          <span>ירידה בדיוק (נק׳ אחוז)</span>
          <input
            type="number" min={5} max={90}
            value={cfg.accuracyDropPct}
            onChange={(e) => { setCfg({ ...cfg, accuracyDropPct: Number(e.target.value) }); setCfgStatus('idle'); }}
          />
        </label>
        <label className="alert-config-field">
          <span>ירידה בציון קוגניטיבי</span>
          <input
            type="number" min={5} max={90}
            value={cfg.scoreDrop}
            onChange={(e) => { setCfg({ ...cfg, scoreDrop: Number(e.target.value) }); setCfgStatus('idle'); }}
          />
        </label>
        <button className="alert-config-save" onClick={saveConfig} disabled={cfgSaving}>
          {cfgSaving ? 'שומר…' : 'שמור ספים'}
        </button>
      </div>
      {cfgStatus === 'saved' && <span className="alert-config-status ok">✓ נשמר</span>}
      {cfgStatus === 'error' && <span className="alert-config-status err">השמירה נכשלה</span>}
    </section>
  );

  if (loading) {
    return (
      <main className="alerts-page" dir="rtl">
        {Header}
        <div className="loading-state"><p>טוען אזעקות…</p></div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="alerts-page" dir="rtl">
        {Header}
        <div className="error-state">
          <span className="emoji">⚠️</span>
          <h2>לא הצלחנו לטעון את האזעקות</h2>
          <p>{error}</p>
          <button className="retry-btn" onClick={fetchAlerts}>נסה שוב</button>
        </div>
      </main>
    );
  }

  if (alerts.length === 0) {
    return (
      <main className="alerts-page" dir="rtl">
        {Header}
        {ConfigPanel}
        <div className="empty-state">
          <span className="emoji">✓</span>
          <h2>אין אזעקות ממתינות</h2>
          <p>כל המטופלים שומרים על ביצועים יציבים — אין צורך בפעולה כרגע</p>
        </div>
      </main>
    );
  }

  return (
    <main className="alerts-page" dir="rtl">
      {Header}
      {ConfigPanel}
      <div className="alerts-list">
        {alerts.map(a => {
          const key   = `${a.userId}_${a.gameId}`;
          const busy  = busyKey === key;
          return (
            <div className="alert-card" key={key}>
              <div className="alert-row-1">
                <button
                  className="alert-user"
                  onClick={() => navigate(`/admin/users/${a.userId}/trend`)}
                  title="הצג מגמת ציון"
                >
                  {a.displayName ?? a.userId}
                </button>
                <span className="alert-game">{GAME_LABELS_HE[a.gameId] ?? a.gameId}</span>
              </div>
              <p className="alert-trigger">{triggerText(a)}</p>
              <div className="alert-meta">
                <span className="alert-time">{relativeTime(a.createdAt)}</span>
                <div className="alert-actions">
                  <button
                    className="alert-btn secondary"
                    onClick={() => navigate(`/admin/users/${a.userId}/trend`)}
                  >
                    צפה בפרטים
                  </button>
                  <button
                    className="alert-btn primary"
                    onClick={() => acknowledge(a)}
                    disabled={busy || !a.alertId}
                  >
                    {busy ? '…' : 'אישור'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
