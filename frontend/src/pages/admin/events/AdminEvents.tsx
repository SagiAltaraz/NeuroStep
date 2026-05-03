import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import "./AdminEvents.css";

interface SessionRow {
  id:            string;
  username?:     string; // Optional, may not be available
  gameId:        string;
  startedAt:     number;
  lastEventAt:   number;
  hits:          number;
  misses:        number;
  timeouts:      number;
  accuracy:      number;
  avgReactionMs: number;
  peakStreak:    number;
  report?: { cognitiveScore: number; summaryHe: string } | null;
}

const GAME_LABELS: Record<string, string> = {
  'shapes-click': 'צורות',
  'color-trains': 'רכבות',
  'tictactoe':    'איקס עיגול',
  'memory':       'זיכרון',
};

const AdminEvents: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState("all");

  useEffect(() => {
    if (!token) { setError("לא מחובר"); setLoading(false); return; }
    fetch("/api/admin/sessions", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => setSessions(data as SessionRow[]))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = filter === "all" ? sessions : sessions.filter(s => s.gameId === filter);

  const fmt = (ms: number) =>
    new Date(ms).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const dur = (s: SessionRow) => {
    const sec = Math.round((s.lastEventAt - s.startedAt) / 1000);
    return sec < 60 ? `${sec}ש'` : `${Math.round(sec / 60)}ד'`;
  };

  return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>סשני משחק</h2>
        <button className="back-btn" onClick={onBack}>← חזרה</button>
      </div>

      <div className="ev-toolbar">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="ev-filter">
          <option value="all">כל המשחקים</option>
          {Object.entries(GAME_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <span className="ev-count">{filtered.length} סשנים</span>
      </div>

      {loading && <p className="ev-state">טוען…</p>}
      {error && (
        <div className="ev-error">
          <strong>שגיאה:</strong> {error}
          <br /><small>ודא ש-backend/server.js רץ (port 3000)</small>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <p className="ev-state">אין סשנים עדיין — שחק משחק כלשהו</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="ev-table-wrap">
          <table className="ev-table">
            <thead>
              <tr>
                <th>משחק</th>
                <th>משתמש</th>
                <th>תאריך</th>
                <th>משך</th>
                <th>דיוק</th>
                <th>RT ממוצע</th>
                <th>שיא רצף</th>
                <th>ציון Claude</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td><span className="ev-game-tag">{GAME_LABELS[s.gameId] ?? s.gameId}</span></td>
                  <td className="ev-uid" title={s.username}>{s.username ? s.username.slice(0, 8) + '…' : '—'}</td>
                  <td>{fmt(s.startedAt)}</td>
                  <td>{dur(s)}</td>
                  <td>
                    <span className={`ev-acc ${s.accuracy >= 0.7 ? 'good' : s.accuracy >= 0.4 ? 'mid' : 'low'}`}>
                      {Math.round(s.accuracy * 100)}%
                    </span>
                  </td>
                  <td>{s.avgReactionMs ? `${s.avgReactionMs}ms` : '—'}</td>
                  <td>{s.peakStreak}</td>
                  <td>
                    {s.report
                      ? <span className={`ev-score ${s.report.cognitiveScore >= 70 ? 'good' : s.report.cognitiveScore >= 40 ? 'mid' : 'low'}`}>
                          {s.report.cognitiveScore}
                        </span>
                      : <span className="ev-dash">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminEvents;
