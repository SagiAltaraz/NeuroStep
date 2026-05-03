import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
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
  const [logs,    setLogs]    = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("לא מחובר"); setLoading(false); return; }
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
    new Date(ms).toLocaleString("he-IL", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  const timeAgo = (ms: number) => {
    const diff = Date.now() - ms;
    if (diff < 60_000)     return 'לפני רגע';
    if (diff < 3_600_000)  return `לפני ${Math.round(diff / 60_000)} דק'`;
    if (diff < 86_400_000) return `לפני ${Math.round(diff / 3_600_000)} שע'`;
    return `לפני ${Math.round(diff / 86_400_000)} ימים`;
  };

  return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>פעילות משתמשים</h2>
        <button className="back-btn" onClick={onBack}>← חזרה</button>
      </div>

      {loading && <p className="act-state">טוען…</p>}
      {error && (
        <div className="act-error">
          <strong>שגיאה:</strong> {error}
          <br /><small>ודא ש-backend/server.js רץ (port 3000)</small>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── User summary cards ── */}
          <h3 className="act-section-title">משתמשים פעילים</h3>
          {userSummary.length === 0
            ? <p className="act-state">אין פעילות עדיין</p>
            : <div className="act-user-grid">
                {userSummary.map(u => (
                  <div key={u.email} className="act-user-card">
                    <div className="act-avatar">{u.name.charAt(0).toUpperCase()}</div>
                    <div className="act-user-info">
                      <span className="act-user-name">{u.name}</span>
                      <span className="act-user-email">{u.email}</span>
                      <span className="act-user-last">כניסה אחרונה: {timeAgo(u.lastLogin)}</span>
                    </div>
                    <div className="act-login-count">{u.count} כניסות</div>
                  </div>
                ))}
              </div>
          }

          {/* ── Recent login feed ── */}
          <h3 className="act-section-title" style={{ marginTop: '2rem' }}>יומן כניסות</h3>
          {logs.length === 0
            ? <p className="act-state">אין רשומות</p>
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
