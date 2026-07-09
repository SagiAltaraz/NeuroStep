import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import './CoachReportsPage.css';

// ─── Types ────────────────────────────────────────────────────────

type GameId = 'shapes-click' | 'color-trains' | 'tictactoe' | 'memory';
type Progress = 'improving' | 'stable' | 'needs_attention';

// CoachReport from backend. Field suffixes are *En today; Phase 4D will
// migrate to *He. The component reads `field_He ?? field_En` so both
// historical and post-migration docs render correctly.
interface CoachReport {
  id?:           string;
  gameId:        GameId;
  generatedAt:   number;
  sessionCount:  number;
  overallProgress:    Progress;
  summaryEn?:         string;
  summaryHe?:         string;
  highlightsEn?:      string[];
  highlightsHe?:      string[];
  recommendationsEn?: string[];
  recommendationsHe?: string[];
  cognitiveInsightEn?: string;
  cognitiveInsightHe?: string;
}

const GAME_LABELS_HE: Record<GameId, string> = {
  'shapes-click': 'איתור צורות',
  'color-trains': 'רכבות צבעוניות',
  'tictactoe':    'איקס עיגול',
  'memory':       'זיכרון',
};

const PROGRESS_LABELS_HE: Record<Progress, string> = {
  improving:        'התקדמות',
  stable:           'יציב',
  needs_attention:  'דורש תשומת לב',
};

const PROGRESS_ICONS: Record<Progress, string> = {
  improving:        '✓',
  stable:           '=',
  needs_attention:  '⚠',
};

// ─── Helpers ──────────────────────────────────────────────────────

function formatDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('he-IL', {
    day: 'numeric', month: 'numeric', year: 'numeric',
  });
}

// Phase 4D-aware accessor: prefer Hebrew field if present, else English.
function he<T>(heVal: T | undefined, enVal: T | undefined): T | undefined {
  return heVal !== undefined ? heVal : enVal;
}

// ─── Component ────────────────────────────────────────────────────

export default function CoachReportsPage() {
  const { userId } = useParams<{ userId: string }>();
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [reports,  setReports]  = useState<CoachReport[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [game,     setGame]     = useState<GameId | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!isAdmin) return <Navigate to="/" />;

  const fetchReports = async () => {
    if (!userId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const url = game === 'all'
        ? `/api/admin/users/${userId}/coach-reports`
        : `/api/admin/users/${userId}/coach-reports?game=${game}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as CoachReport[];
      setReports(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token, game]);

  // Detect which games this user has reports in (only show tabs if >1)
  const availableGames = useMemo(() => {
    const set = new Set<GameId>();
    reports.forEach(r => set.add(r.gameId));
    return [...set];
  }, [reports]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────
  const Header = (
    <div className="cr-header">
      <div>
        <h1>דוחות התקדמות</h1>
        <p className="subtitle">{userId}</p>
      </div>
      <button className="cr-back-btn" onClick={() => navigate(-1)}>
        <ChevronRight size={14} />
        חזור
      </button>
    </div>
  );

  if (loading) {
    return (
      <main className="coach-reports-page" dir="rtl">
        {Header}
        <div className="loading-state"><p>טוען דוחות…</p></div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="coach-reports-page" dir="rtl">
        {Header}
        <div className="error-state">
          <span className="emoji">⚠️</span>
          <h2>לא הצלחנו לטעון את הדוחות</h2>
          <p>{error}</p>
          <button className="retry-btn" onClick={fetchReports}>נסה שוב</button>
        </div>
      </main>
    );
  }

  if (reports.length === 0) {
    return (
      <main className="coach-reports-page" dir="rtl">
        {Header}
        <div className="empty-state">
          <span className="emoji">📋</span>
          <h2>עדיין לא הופקו דוחות</h2>
          <p>דרושים לפחות 5 משחקים מאותו סוג כדי להפיק דוח התקדמות</p>
        </div>
      </main>
    );
  }

  // ── Game tabs (only when multiple games or filter is active) ──
  const showTabs = availableGames.length > 1 || game !== 'all';

  return (
    <main className="coach-reports-page" dir="rtl">
      {Header}

      {showTabs && (
        <div className="cr-game-tabs" role="group" aria-label="סינון לפי משחק">
          <button
            type="button"
            className={`cr-game-tab${game === 'all' ? ' active' : ''}`}
            aria-pressed={game === 'all'}
            onClick={() => setGame('all')}
          >
            הכול
          </button>
          {availableGames.map(g => (
            <button
              key={g}
              type="button"
              className={`cr-game-tab${game === g ? ' active' : ''}`}
              aria-pressed={game === g}
              onClick={() => setGame(g)}
            >
              {GAME_LABELS_HE[g]}
            </button>
          ))}
        </div>
      )}

      <div className="cr-list">
        {reports.map(r => {
          const id           = r.id ?? `${r.gameId}-${r.generatedAt}`;
          const isOpen       = expanded.has(id);
          const summary      = he(r.summaryHe,         r.summaryEn);
          const highlights   = he(r.highlightsHe,      r.highlightsEn) ?? [];
          const recs         = he(r.recommendationsHe, r.recommendationsEn) ?? [];
          const insight      = he(r.cognitiveInsightHe, r.cognitiveInsightEn);

          return (
            <div className="cr-card" key={id}>
              <div className="cr-card-head">
                <div className="cr-card-meta">
                  <span className="cr-card-game">{GAME_LABELS_HE[r.gameId] ?? r.gameId}</span>
                  <span>{formatDate(r.generatedAt)}</span>
                </div>
                <span className={`cr-progress-badge ${r.overallProgress}`}>
                  <span aria-hidden>{PROGRESS_ICONS[r.overallProgress]}</span>
                  {PROGRESS_LABELS_HE[r.overallProgress]}
                </span>
              </div>

              {summary && <p className="cr-summary">{summary}</p>}

              <button
                className="cr-toggle"
                onClick={() => toggle(id)}
                aria-expanded={isOpen}
              >
                {isOpen ? '▲ הסתר פרטים' : '▼ הצג פרטים'}
              </button>

              {isOpen && (
                <div className="cr-details">
                  {highlights.length > 0 && (
                    <div className="cr-section">
                      <h3>נקודות חוזק</h3>
                      <ul>{highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
                    </div>
                  )}
                  {recs.length > 0 && (
                    <div className="cr-section">
                      <h3>המלצות</h3>
                      <ul>{recs.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                  )}
                  {insight && (
                    <div className="cr-section">
                      <h3>תובנה קוגניטיבית</h3>
                      <p>{insight}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="cr-card-footer">
                מבוסס על {r.sessionCount} משחקים שנערכו עד כה
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
