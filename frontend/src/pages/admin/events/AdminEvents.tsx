import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useAdminT, ADMIN_GAME_IDS } from "../adminI18n";
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

const AdminEvents: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { token } = useAuth();
  const { t, dir, locale, gameLabel } = useAdminT();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState("all");

  useEffect(() => {
    if (!token) { setError(t('common.notAuth')); setLoading(false); return; }
    fetch("/api/admin/sessions", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => setSessions(data as SessionRow[]))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = filter === "all" ? sessions : sessions.filter(s => s.gameId === filter);

  const fmt = (ms: number) =>
    new Date(ms).toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const dur = (s: SessionRow) => {
    const sec = Math.round((s.lastEventAt - s.startedAt) / 1000);
    return sec < 60 ? `${sec}${t('ev.secShort')}` : `${Math.round(sec / 60)}${t('ev.minShort')}`;
  };

  return (
    <div className="admin-view-page" dir={dir}>
      <div className="view-header">
        <h2>{t('ev.title')}</h2>
        <button className="back-btn" onClick={onBack}>← {t('common.backArrow')}</button>
      </div>

      <div className="ev-toolbar">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="ev-filter">
          <option value="all">{t('ev.allGames')}</option>
          {ADMIN_GAME_IDS.map(id => (
            <option key={id} value={id}>{gameLabel(id)}</option>
          ))}
        </select>
        <span className="ev-count">{filtered.length} {t('ev.countLabel')}</span>
      </div>

      {loading && <p className="ev-state">{t('ev.loading')}</p>}
      {error && (
        <div className="ev-error">
          <strong>{t('common.error')}:</strong> {error}
          <br /><small>{t('common.backendHint')}</small>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <p className="ev-state">{t('ev.empty')}</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="ev-table-wrap">
          <table className="ev-table">
            <thead>
              <tr>
                <th>{t('common.game')}</th>
                <th>{t('ev.user')}</th>
                <th>{t('common.date')}</th>
                <th>{t('ev.duration')}</th>
                <th>{t('common.accuracy')}</th>
                <th>{t('ev.avgRt')}</th>
                <th>{t('ev.peakStreak')}</th>
                <th>{t('ev.claudeScore')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td><span className="ev-game-tag">{gameLabel(s.gameId)}</span></td>
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
