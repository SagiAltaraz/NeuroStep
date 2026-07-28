import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAdminT, ADMIN_GAME_IDS, type AdminGameId } from '../adminI18n';
import './CognitiveTrendPage.css';

// ─── Types ────────────────────────────────────────────────────────

type GameId = AdminGameId;
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

// Distinct colors for the multi-line "all games" view — one per game.
const GAME_COLORS: Record<GameId, string> = {
  'shapes-click':    '#0284c7',  // blue
  'color-trains':    '#16a34a',  // green
  'tictactoe':       '#9333ea',  // purple
  'memory':          '#ea580c',  // orange
  'green-light':     '#0d9488',  // teal
  'spot-difference': '#db2777',  // pink
  'where-was-it':    '#ca8a04',  // amber
  'find-letter':     '#4f46e5',  // indigo
};

const PERIOD_VALUES: PeriodFilter[] = ['7d', '30d', '90d', 'all'];

// ─── Helpers ──────────────────────────────────────────────────────

function scoreClass(score: number | null): 'good' | 'mid' | 'low' | 'na' {
  if (score === null) return 'na';
  if (score >= 70)    return 'good';
  if (score >= 40)    return 'mid';
  return 'low';
}

// ─── Component ────────────────────────────────────────────────────

export default function CognitiveTrendPage() {
  const { userId } = useParams<{ userId: string }>();
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { t, lang, dir, locale, gameLabel } = useAdminT();

  const [game,    setGame]    = useState<GameFilter>('all');
  const [period,  setPeriod]  = useState<PeriodFilter>('30d');
  const [data,    setData]    = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const formatDate = useCallback((ts: number | null): string => {
    if (ts === null) return '—';
    return new Date(ts).toLocaleDateString(locale, {
      day: 'numeric', month: 'numeric', year: 'numeric',
    });
  }, [locale]);

  const periodLabel = useCallback((p: PeriodFilter) => t(`tp.period.${p}` as const), [t]);

  const fetchTrend = async () => {
    if (!userId || !token || !isAdmin) return;
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
      setError(err instanceof Error ? err.message : t('common.loadError'));
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
  }, [data, game, formatDate]);

  // Only plot lines for games this user actually has data for — otherwise the
  // legend lists all eight games even when only two were played.
  const gamesInData = useMemo(() => {
    const seen = new Set<GameId>();
    data?.series.forEach(p => { if (p.gameId) seen.add(p.gameId); });
    return ADMIN_GAME_IDS.filter(g => seen.has(g));
  }, [data]);

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

  // ── Auth gate (admin-only) ────────────────────────────────────
  // Must sit below every hook: bailing out earlier would render a different
  // number of hooks if `isAdmin` ever flips, which React treats as an error.
  if (!isAdmin) return <Navigate to="/" />;

  // ── Render: loading / error states ────────────────────────────
  const Header = (
    <div className="trend-header">
      <div>
        <h1>{t('tp.title')}</h1>
        <p className="subtitle">
          {data?.user.displayName ? `${data.user.displayName} · ` : ''}{userId}
        </p>
      </div>
      <button className="trend-back-btn" onClick={() => navigate(-1)}>
        <ChevronRight size={14} />
        {t('common.back')}
      </button>
    </div>
  );

  if (loading) {
    return (
      <main className="trend-page" dir={dir}>
        {Header}
        <div className="loading-state">
          <p>{t('common.loading')}</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="trend-page" dir={dir}>
        {Header}
        <div className="error-state">
          <span className="emoji">⚠️</span>
          <h2>{t('tp.loadError')}</h2>
          <p>{error}</p>
          <button className="retry-btn" onClick={fetchTrend}>{t('common.retry')}</button>
        </div>
      </main>
    );
  }

  const hasAnyData = (data?.series.length ?? 0) > 0;

  return (
    <main className="trend-page" dir={dir}>
      {Header}

      {/* ── Filters ── */}
      <div className="trend-filters">
        <div className="filter-group">
          <label className="filter-label" htmlFor="game-filter">{t('tp.filterGame')}</label>
          <select
            id="game-filter"
            className="filter-select"
            value={game}
            onChange={(e) => setGame(e.target.value as GameFilter)}
          >
            <option value="all">{t('common.all')}</option>
            {ADMIN_GAME_IDS.map(g => (
              <option key={g} value={g}>{gameLabel(g)}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <span className="filter-label">{t('tp.filterPeriod')}</span>
          <div className="filter-pills" role="group" aria-label={t('tp.periodPick')}>
            {PERIOD_VALUES.map(value => (
              <button
                key={value}
                type="button"
                className={`filter-pill${period === value ? ' active' : ''}`}
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
              >
                {periodLabel(value)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Empty state ── */}
      {!hasAnyData ? (
        <div className="empty-state">
          <span className="emoji">📈</span>
          <h2>{t('tp.emptyTitle')}</h2>
          <p>{t('tp.emptyBody')}</p>
        </div>
      ) : (
        <>
          {/* ── Summary KPIs ── */}
          <div className="summary-row">
            <div className="summary-card">
              <span className="summary-label">{t('tp.latestScore')}</span>
              <span className="summary-value">{data!.summary.latestScore ?? '—'}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">{t('tp.periodAvg')}</span>
              <span className="summary-value">{data!.summary.periodAverage ?? '—'}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">{t('tp.change')}</span>
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
              <span className="summary-label">{t('tp.sessions')}</span>
              <span className="summary-value">{data!.summary.sessionsCount}</span>
            </div>
          </div>

          {/* ── Chart ── */}
          <div className="chart-card">
            <h2 className="chart-title">{t('tp.chartTitle')}</h2>
            <p className="chart-subtitle">{t('tp.chartSub')}</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 8, right: 18, left: -6, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                {/* Newest-first reads right-to-left in Hebrew, left-to-right in English. */}
                <XAxis dataKey="date" tick={{ fontSize: 12 }} reversed={lang === 'he'} />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tick={{ fontSize: 12 }}
                />
                <ReferenceLine y={40} stroke="#fbbf24" strokeDasharray="4 4" />
                <ReferenceLine y={70} stroke="#16a34a" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{ direction: dir, textAlign: lang === 'he' ? 'right' : 'left' }}
                  formatter={(value, name) => [
                    value === null || value === undefined ? '—' : `${value}/100`,
                    typeof name === 'string' ? gameLabel(name) : t('common.score'),
                  ]}
                />
                {game === 'all' ? (
                  <>
                    <Legend formatter={(value: string) => gameLabel(value)} />
                    {gamesInData.map(g => (
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
                    name={gameLabel(game)}
                    stroke={GAME_COLORS[game as GameId]}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>

            {/* Accessible text fallback for the chart */}
            <table className="chart-fallback-table">
              <caption>{t('tp.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('common.date')}</th>
                  <th scope="col">{t('common.game')}</th>
                  <th scope="col">{t('common.score')}</th>
                </tr>
              </thead>
              <tbody>
                {reversedSessions.slice(0, 30).map(p => (
                  <tr key={p.sessionId}>
                    <td>{formatDate(p.generatedAt)}</td>
                    <td>{gameLabel(p.gameId)}</td>
                    <td>{p.cognitiveScore ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Session list ── */}
          <h2 className="chart-title" style={{ marginBottom: 12 }}>{t('tp.recent')}</h2>
          <div className="session-list">
            {reversedSessions.map(p => {
              const isExpanded = expanded.has(p.sessionId);
              return (
                <div className="session-card" key={p.sessionId}>
                  <div className="session-row-1">
                    <div className="session-meta">
                      <span className="session-game">{gameLabel(p.gameId)}</span>
                      <span>{formatDate(p.generatedAt)}</span>
                      <span>
                        {t('common.accuracy')}: {p.accuracy === null ? '—' : `${Math.round(p.accuracy * 100)}%`}
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
                          {isExpanded ? t('tp.showLess') : t('tp.showMore')}
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
