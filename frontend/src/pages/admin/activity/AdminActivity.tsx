/**
 * AdminActivity — who is coming into NeuroStep, and when.
 *
 * Two panels from one endpoint:
 *   • the per-user summary  — served by the backend from the users collection,
 *     so the login count and "last login" are exact however old they are;
 *   • the login feed        — the most recent entries, newest first.
 *
 * The page keeps ITSELF current: it polls while it is open and refetches the
 * moment the tab regains focus, so a login that happens while an admin is
 * watching shows up on its own. A one-shot fetch on mount (what this used to
 * do) is what made the log look frozen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useAdminT } from "../adminI18n";
import "./AdminActivity.css";

type LoginMethod = 'email' | 'google' | 'signup';

interface ActivityLog {
  id:        string;
  userId:    string;
  name:      string;
  email:     string;
  method:    LoginMethod;
  timestamp: number;
}

interface ActivityUser {
  id:          string;
  name:        string | null;
  email:       string | null;
  role:        string;
  createdAt:   number | null;
  lastLoginAt: number | null;
  loginCount:  number;
  countApprox: boolean;
}

interface ActivityResponse {
  logs:        ActivityLog[];
  users:       ActivityUser[];
  truncated:   boolean;
  generatedAt: number;
}

const POLL_MS = 30_000;
const FEED_LIMIT = 100;

const AdminActivity: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { token } = useAuth();
  const { t, tn, dir, locale } = useAdminT();
  const [data,      setData]      = useState<ActivityResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  // Re-render on a timer so "5 min ago" keeps counting between fetches.
  const [, setTick] = useState(0);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/activity?limit=${FEED_LIMIT}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as ActivityResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) { setError(t('common.notAuth')); setLoading(false); return; }
    load();

    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    // Coming back to the tab should show the truth immediately, not in 30s.
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);

    const tick = window.setInterval(() => setTick(n => n + 1), 30_000);

    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [token, load, t]);

  const logs = data?.logs ?? [];
  // Everyone who has ever been in, most recent first. The API also returns
  // accounts that never signed in — this panel is "active users", so they stay
  // out of it, but they are one filter away if we ever want them.
  const users = (data?.users ?? []).filter(u => u.lastLoginAt !== null || u.loginCount > 0);

  const fmt = (ms: number) =>
    new Date(ms).toLocaleString(locale, {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const timeAgo = (ms: number | null) => {
    if (ms === null) return t('ac.neverLogged');
    const diff = Date.now() - ms;
    if (diff < 60_000)     return t('ac.agoNow');
    if (diff < 3_600_000)  return tn('ac.agoMin', Math.round(diff / 60_000));
    if (diff < 86_400_000) return tn('ac.agoHour', Math.round(diff / 3_600_000));
    return tn('ac.agoDay', Math.round(diff / 86_400_000));
  };

  const methodLabel = (method: LoginMethod) =>
    method === 'google' ? 'Google' : method === 'signup' ? t('ac.methodSignup') : 'Email';

  const initial = (name: string | null, email: string | null) =>
    (name?.trim() || email?.trim() || '?').charAt(0).toUpperCase();

  return (
    <div className="admin-view-page" dir={dir}>
      <div className="view-header">
        <h2>{t('ac.title')}</h2>
        <button className="back-btn" onClick={onBack}>← {t('common.backArrow')}</button>
      </div>

      <div className="act-toolbar">
        <button className="act-refresh" onClick={load} disabled={refreshing || !token}>
          {refreshing ? t('ac.refreshing') : `⟳ ${t('ac.refresh')}`}
        </button>
        {data && (
          <span className="act-updated" title={t('ac.autoRefresh')}>
            {tn('ac.updated', clock(data.generatedAt))}
          </span>
        )}
      </div>

      {loading && <p className="act-state">{t('ac.loading')}</p>}
      {error && (
        <div className="act-error">
          <strong>{t('common.error')}:</strong> {error}
          <br /><small>{t('common.backendHint')}</small>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── User summary cards ── */}
          <h3 className="act-section-title">{t('ac.activeUsers')}</h3>
          {users.length === 0
            ? <p className="act-state">{t('ac.noActivity')}</p>
            : <div className="act-user-grid">
                {users.map(u => (
                  <div key={u.id} className="act-user-card">
                    <div className="act-avatar">{initial(u.name, u.email)}</div>
                    <div className="act-user-info">
                      <span className="act-user-name">{u.name ?? u.email ?? u.id}</span>
                      <span className="act-user-email">{u.email ?? '—'}</span>
                      <span
                        className="act-user-last"
                        title={u.lastLoginAt ? fmt(u.lastLoginAt) : undefined}
                      >
                        {t('ac.lastLogin')}: {timeAgo(u.lastLoginAt)}
                      </span>
                    </div>
                    <div className="act-login-count">
                      {u.countApprox ? '~' : ''}{u.loginCount} {t('ac.logins')}
                    </div>
                  </div>
                ))}
              </div>
          }

          {/* ── Recent login feed ── */}
          <h3 className="act-section-title" style={{ marginTop: '2rem' }}>{t('ac.loginLog')}</h3>
          {data?.truncated && (
            <p className="act-note">{tn('ac.showingLast', logs.length)}</p>
          )}
          {logs.length === 0
            ? <p className="act-state">{t('ac.noRecords')}</p>
            : <div className="act-feed">
                {logs.map(log => (
                  <div key={log.id} className="act-feed-row">
                    <div className="act-feed-avatar">{initial(log.name, log.email)}</div>
                    <div className="act-feed-main">
                      <span className="act-feed-name">{log.name}</span>
                      <span className="act-feed-email">{log.email}</span>
                    </div>
                    <span className={`act-method ${log.method}`}>{methodLabel(log.method)}</span>
                    <span className="act-feed-time" title={fmt(log.timestamp)}>
                      {timeAgo(log.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
          }
        </>
      )}
    </div>
  );
};

export default AdminActivity;
