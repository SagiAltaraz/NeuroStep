import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import './CognitiveTrendPage.css';

// ─── Types ────────────────────────────────────────────────────────

type GameId = 'shapes-click' | 'color-trains' | 'tictactoe' | 'memory';
type GameFilter   = GameId | 'all';
type PeriodFilter = '7d' | '30d' | '90d' | 'all';

interface SeriesPoint {
  sessionId:      string;
  generatedAt:    number | null;
  gameId:         GameId | null;
  cognitiveScore: number | null;
  accuracy:       number | null;
  summaryHe:      string;
}

interface TrendResponse {
  user:    { userId: string; displayName: string | null };
  series:  SeriesPoint[];
  summary: {
    latestScore:   number | null;
    periodAverage: number | null;
    periodChange:  number | null;
    sessionsCount: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────

const GAME_LABELS_HE: Record<GameId, string> = {
  'shapes-click': 'איתור צורות',
  'color-trains': 'רכבות צבעוניות',
  'tictactoe':    'איקס עיגול',
  'memory':       'זיכרון',
};

// Distinct colors for the multi-line "all games" view
const GAME_COLORS: Record<GameId, string> = {
  'shapes-click': '#0284c7',  // blue
  'color-trains': '#16a34a',  // green
  'tictactoe':    '#9333ea',  // purple
  'memory':       '#ea580c',  // orange
};

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: '7d',  label: '7 ימים' },
  { value: '30d', label: '30 ימים' },
  { value: '90d', label: '90 ימים' },
  { value: 'all', label: 'הכול' },
];

// ─── Helpers ──────────────────────────────────────────────────────

function scoreClass(score: number | null): 'good' | 'mid' | 'low' | 'na' {
  if (score === null) return 'na';
  if (score >= 70)    return 'good';
  if (score >= 40)    return 'mid';
  return 'low';
}

function formatDate(ts: number | null): string {
  if (ts === null) return '—';
  return new Date(ts).toLocaleDateString('he-IL', {
    day: 'numeric', month: 'numeric', year: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────

export default function CognitiveTrendPage() {
  const { userId } = useParams<{ userId: string }>();
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [game,    setGame]    = useState<GameFilter>('all');
  const [period,  setPeriod]  = useState<PeriodFilter>('30d');
  const [data,    setData]    = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Auth gate (admin-only) ────────────────────────────────────
  if (!isAdmin) return <Navigate to="/" />;

  const fetchTrend = async () => {
    if (!userId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/trend?game=${game}&period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as TrendResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  };

  // Refetch on filter change
  useEffect(() => {
    fetchTrend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, game, period]);

  // ── Chart data shaping ────────────────────────────────────────
  // For 'all' games, pivot the series into one row per timestamp with one
  // column per gameId — recharts renders one Line per dataKey.
  const chartData = useMemo(() => {
    if (!data) return [];
    if (game !== 'all') {
      return data.series.map(p => ({
        date:  formatDate(p.generatedAt),
        ts:    p.generatedAt ?? 0,
        score: p.cognitiveScore,
      }));
    }
    // Pivot per gameId
    const byTs = new Map<number, Record<string, number | null | string>>();
    for (const p of data.series) {
      if (p.generatedAt === null || !p.gameId) continue;
      const row = byTs.get(p.generatedAt) ?? { date: formatDate(p.generatedAt), ts: p.generatedAt };
      row[p.gameId] = p.cognitiveScore;
      byTs.set(p.generatedAt, row);
    }
    return [...byTs.values()].sort((a, b) => (a.ts as number) - (b.ts as number));
  }, [data, game]);

  const reversedSessions = useMemo(() => {
    if (!data) return [];
    return [...data.series].reverse(); // newest first for the list below
  }, [data]);

  const toggleExpand = (sessionId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else                     next.add(sessionId);
      return next;
    });
  };

  // ── Render: loading / error states ────────────────────────────
  const Header = (
    <div className="trend-header">
      <div>
        <h1>מגמת ציון קוגניטיבי</h1>
        <p className="subtitle">
          {data?.user.displayName ? `${data.user.displayName} · ` : ''}{userId}
        </p>
      </div>
      <button className="trend-back-btn" onClick={() => navigate(-1)}>
        <ChevronRight size={14} />
        חזור
      </button>
    </div>
  );

  if (loading) {
    return (
      <main className="trend-page" dir="rtl">
        {Header}
        <div className="loading-state">
          <p>טוען נתונים…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="trend-page" dir="rtl">
        {Header}
        <div className="error-state">
          <span className="emoji">⚠️</span>
          <h2>לא הצלחנו לטעון את הנתונים</h2>
          <p>{error}</p>
          <button className="retry-btn" onClick={fetchTrend}>נסה שוב</button>
        </div>
      </main>
    );
  }

  const hasAnyData = (data?.series.length ?? 0) > 0;

  return (
    <main className="trend-page" dir="rtl">
      {Header}

      {/* ── Filters ── */}
      <div className="trend-filters">
        <div className="filter-group">
          <label className="filter-label" htmlFor="game-filter">משחק</label>
          <select
            id="game-filter"
            className="filter-select"
            value={game}
            onChange={(e) => setGame(e.target.value as GameFilter)}
          >
            <option value="all">הכול</option>
            <option value="shapes-click">{GAME_LABELS_HE['shapes-click']}</option>
            <option value="color-trains">{GAME_LABELS_HE['color-trains']}</option>
            <option value="tictactoe">{GAME_LABELS_HE['tictactoe']}</option>
            <option value="memory">{GAME_LABELS_HE['memory']}</option>
          </select>
        </div>

        <div className="filter-group">
          <span className="filter-label">תקופה</span>
          <div className="filter-pills" role="group" aria-label="בחירת תקופה">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`filter-pill${period === opt.value ? ' active' : ''}`}
                aria-pressed={period === opt.value}
                onClick={() => setPeriod(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Empty state ── */}
      {!hasAnyData ? (
        <div className="empty-state">
          <span className="emoji">📈</span>
          <h2>עדיין אין דאטה</h2>
          <p>שחקו כמה משחקים והדוחות יופיעו כאן</p>
        </div>
      ) : (
        <>
          {/* ── Summary KPIs ── */}
          <div className="summary-row">
            <div className="summary-card">
              <span className="summary-label">ציון אחרון</span>
              <span className="summary-value">{data!.summary.latestScore ?? '—'}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">ממוצע בתקופה</span>
              <span className="summary-value">{data!.summary.periodAverage ?? '—'}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">שינוי</span>
              <span className={`summary-value ${
                data!.summary.periodChange === null
                  ? 'neutral'
                  : data!.summary.periodChange > 0 ? 'positive'
                  : data!.summary.periodChange < 0 ? 'negative' : 'neutral'
              }`}>
                {data!.summary.periodChange === null ? '—' : (
                  <>
                    <span className="summary-arrow">
                      {data!.summary.periodChange > 0 ? '▲'
                        : data!.summary.periodChange < 0 ? '▼' : '='}
                    </span>
                    {Math.abs(data!.summary.periodChange)}
                  </>
                )}
              </span>
            </div>
            <div className="summary-card">
              <span className="summary-label">מספר משחקים</span>
              <span className="summary-value">{data!.summary.sessionsCount}</span>
            </div>
          </div>

          {/* ── Chart ── */}
          <div className="chart-card">
            <h2 className="chart-title">ציון קוגניטיבי לאורך זמן</h2>
            <p className="chart-subtitle">סולם 0–100 · קו 40 = ממוצע · קו 70 = ביצועים חזקים</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 8, right: 18, left: -6, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} reversed />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tick={{ fontSize: 12 }}
                />
                <ReferenceLine y={40} stroke="#fbbf24" strokeDasharray="4 4" />
                <ReferenceLine y={70} stroke="#16a34a" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{ direction: 'rtl', textAlign: 'right' }}
                  formatter={(value, name) => [
                    value === null || value === undefined ? '—' : `${value}/100`,
                    typeof name === 'string' && name in GAME_LABELS_HE
                      ? GAME_LABELS_HE[name as GameId]
                      : 'ציון',
                  ]}
                />
                {game === 'all' ? (
                  <>
                    <Legend
                      formatter={(value: string) =>
                        value in GAME_LABELS_HE ? GAME_LABELS_HE[value as GameId] : value
                      }
                    />
                    {(Object.keys(GAME_LABELS_HE) as GameId[]).map(g => (
                      <Line
                        key={g}
                        type="monotone"
                        dataKey={g}
                        stroke={GAME_COLORS[g]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </>
                ) : (
                  <Line
                    type="monotone"
                    dataKey="score"
                    name={GAME_LABELS_HE[game]}
                    stroke={GAME_COLORS[game as GameId]}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>

            {/* Accessible text fallback for the chart */}
            <table className="chart-fallback-table">
              <caption>טבלה זמינה לקוראי מסך — נתוני הגרף לעיל</caption>
              <thead>
                <tr>
                  <th scope="col">תאריך</th>
                  <th scope="col">משחק</th>
                  <th scope="col">ציון</th>
                </tr>
              </thead>
              <tbody>
                {reversedSessions.slice(0, 30).map(p => (
                  <tr key={p.sessionId}>
                    <td>{formatDate(p.generatedAt)}</td>
                    <td>{p.gameId ? GAME_LABELS_HE[p.gameId] : '—'}</td>
                    <td>{p.cognitiveScore ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Session list ── */}
          <h2 className="chart-title" style={{ marginBottom: 12 }}>משחקים אחרונים</h2>
          <div className="session-list">
            {reversedSessions.map(p => {
              const isExpanded = expanded.has(p.sessionId);
              return (
                <div className="session-card" key={p.sessionId}>
                  <div className="session-row-1">
                    <div className="session-meta">
                      <span className="session-game">
                        {p.gameId ? GAME_LABELS_HE[p.gameId] : '—'}
                      </span>
                      <span>{formatDate(p.generatedAt)}</span>
                      <span>
                        דיוק: {p.accuracy === null ? '—' : `${Math.round(p.accuracy * 100)}%`}
                      </span>
                    </div>
                    <span className={`session-score score-${scoreClass(p.cognitiveScore)}`}>
                      {p.cognitiveScore === null ? '—' : `${p.cognitiveScore}/100`}
                    </span>
                  </div>
                  {p.summaryHe && (
                    <>
                      <p className={`session-summary${isExpanded ? '' : ' collapsed'}`}>
                        {p.summaryHe}
                      </p>
                      {p.summaryHe.length > 120 && (
                        <button
                          className="session-expand-btn"
                          onClick={() => toggleExpand(p.sessionId)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? 'כווץ' : 'הצג עוד'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
