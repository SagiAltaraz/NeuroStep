import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useAdminT } from "../adminI18n";
import "./AdminActivity.css";

interface ActivityLog {
  id:        string;
  userId:    string;
  name:      string;
  email:     string;
  method:    'email' | 'google';
  timestamp: number;
}

const AdminActivity: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { token } = useAuth();
  const { t, tn, dir, locale } = useAdminT();
  const [logs,    setLogs]    = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError(t('common.notAuth')); setLoading(false); return; }
    fetch("/api/admin/activity", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => setLogs(data as ActivityLog[]))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Group logins per user for summary
  const userSummary = Object.values(
    logs.reduce<Record<string, { name: string; email: string; count: number; lastLogin: number }>>(
      (acc, log) => {
        if (!acc[log.userId]) {
          acc[log.userId] = { name: log.name, email: log.email, count: 0, lastLogin: 0 };
        }
        acc[log.userId].count++;
        if (log.timestamp > acc[log.userId].lastLogin) acc[log.userId].lastLogin = log.timestamp;
        return acc;
      }, {}
    )
  ).sort((a, b) => b.lastLogin - a.lastLogin);

  const fmt = (ms: number) =>
    new Date(ms).toLocaleString(locale, {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  const timeAgo = (ms: number) => {
    const diff = Date.now() - ms;
    if (diff < 60_000)     return t('ac.agoNow');
    if (diff < 3_600_000)  return tn('ac.agoMin', Math.round(diff / 60_000));
    if (diff < 86_400_000) return tn('ac.agoHour', Math.round(diff / 3_600_000));
    return tn('ac.agoDay', Math.round(diff / 86_400_000));
  };

  return (
    <div className="admin-view-page" dir={dir}>
      <div className="view-header">
        <h2>{t('ac.title')}</h2>
        <button className="back-btn" onClick={onBack}>← {t('common.backArrow')}</button>
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
          {userSummary.length === 0
            ? <p className="act-state">{t('ac.noActivity')}</p>
            : <div className="act-user-grid">
                {userSummary.map(u => (
                  <div key={u.email} className="act-user-card">
                    <div className="act-avatar">{u.name.charAt(0).toUpperCase()}</div>
                    <div className="act-user-info">
                      <span className="act-user-name">{u.name}</span>
                      <span className="act-user-email">{u.email}</span>
                      <span className="act-user-last">{t('ac.lastLogin')}: {timeAgo(u.lastLogin)}</span>
                    </div>
                    <div className="act-login-count">{u.count} {t('ac.logins')}</div>
                  </div>
                ))}
              </div>
          }

          {/* ── Recent login feed ── */}
          <h3 className="act-section-title" style={{ marginTop: '2rem' }}>{t('ac.loginLog')}</h3>
          {logs.length === 0
            ? <p className="act-state">{t('ac.noRecords')}</p>
            : <div className="act-feed">
                {logs.map(log => (
                  <div key={log.id} className="act-feed-row">
                    <div className="act-feed-avatar">{log.name.charAt(0).toUpperCase()}</div>
                    <div className="act-feed-main">
                      <span className="act-feed-name">{log.name}</span>
                      <span className="act-feed-email">{log.email}</span>
                    </div>
                    <span className={`act-method ${log.method}`}>
                      {log.method === 'google' ? 'Google' : 'Email'}
                    </span>
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
