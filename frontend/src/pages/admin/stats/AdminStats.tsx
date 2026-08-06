import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { useAuth } from '../../../context/AuthContext';
import { useAdminT } from '../adminI18n';
import './AdminStats.css';

// ── Types ──────────────────────────────────────────────────────────────────────
// Mirrors the response shape of GET /api/admin/sessions (server-side pulls
// from Firestore via Admin SDK; we never touch Firestore from the browser).

interface SessionDoc {
  id?:          string;
  userId:       string;
  gameId:       string;
  startedAt:    number;
  accuracy:     number | null;     // null when no scored events (Phase 0)
  avgReactionMs: number;
  peakStreak:   number;
  hits:         number;
  misses:       number;
  timeouts:     number;
  username?:    string | null;
  ageGroup?:    string | null;   // from the onboarding questionnaire (Q1)
  gender?:      string | null;   // from the onboarding questionnaire (Q2)
  report?: {
    cognitiveScore: number;
    summaryHe:      string;
    generatedAt:    number;
  } | null;
}

interface TokenUsage {
  totalInputTokens:  number;
  totalOutputTokens: number;
  totalReports:      number;
  lastUpdated:       number;
}

// Haiku 4.5 pricing
const INPUT_COST_PER_TOKEN  = 0.80  / 1_000_000;  // $0.80 / 1M
const OUTPUT_COST_PER_TOKEN = 4.00  / 1_000_000;  // $4.00 / 1M

// ── Component ──────────────────────────────────────────────────────────────────

const AdminStats: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { token } = useAuth();
  const { t, gameLabel } = useAdminT();
  const [sessions,    setSessions]    = useState<SessionDoc[]>([]);
  const [tokenUsage,  setTokenUsage]  = useState<TokenUsage | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  // ── Compare controls (section 2) ──
  const [cmpMode,   setCmpMode]   = useState<'users' | 'groups'>('users');
  const [cmpMetric, setCmpMetric] = useState<'accuracy' | 'score' | 'reaction'>('accuracy');
  const [cmpGame,   setCmpGame]   = useState<string>('all');
  const [cmpUserA,  setCmpUserA]  = useState<string>('');
  const [cmpUserB,  setCmpUserB]  = useState<string>('');
  const [cmpDim,    setCmpDim]    = useState<'gender' | 'age'>('age');
  const [cmpGroups, setCmpGroups] = useState<string[]>([]);   // selected demographic buckets

  useEffect(() => {
    if (!token) return;
    async function load() {
      try {
        const headers = { Authorization: `Bearer ${token}` };

        const [sessionsRes, tokenRes] = await Promise.all([
          fetch('/api/admin/sessions',    { headers }),
          fetch('/api/admin/token-usage', { headers }),
        ]);
        if (!sessionsRes.ok) throw new Error(`Sessions HTTP ${sessionsRes.status}`);
        if (!tokenRes.ok)    throw new Error(`Token usage HTTP ${tokenRes.status}`);

        const sessionDocs = (await sessionsRes.json()) as SessionDoc[];
        const tokenDoc    = (await tokenRes.json())    as TokenUsage;

        setSessions(sessionDocs);
        setTokenUsage(tokenDoc.totalReports !== undefined ? tokenDoc : null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[AdminStats] API error:', err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const totalSessions  = sessions.length;
  const uniqueUsers    = new Set(sessions.map(s => s.userId)).size;

  // Sessions with at least one scored event (i.e. accuracy is non-null) —
  // tic-tac-toe sessions with only MOVE_MADE will be skipped here per Phase 0.
  const sessionsWithAccuracy = sessions.filter(
    (s): s is SessionDoc & { accuracy: number } => typeof s.accuracy === 'number'
  );
  const avgAccuracy = sessionsWithAccuracy.length
    ? Math.round((sessionsWithAccuracy.reduce((sum, d) => sum + d.accuracy, 0) / sessionsWithAccuracy.length) * 100)
    : 0;
  const reportsWithScore = sessions.filter(s => s.report?.cognitiveScore != null);
  const avgCogScore    = reportsWithScore.length
    ? Math.round(reportsWithScore.reduce((s, d) => s + d.report!.cognitiveScore, 0) / reportsWithScore.length)
    : null;

  // Bar chart: avg accuracy per game (only sessions that have accuracy)
  const byGame = Object.entries(
    sessionsWithAccuracy.reduce<Record<string, number[]>>((acc, s) => {
      (acc[s.gameId] ??= []).push(s.accuracy);
      return acc;
    }, {})
  ).map(([gameId, vals]) => ({
    name:     gameLabel(gameId),
    accuracy: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100),
  }));

  // Per-game success breakdown (section 1): one row per game with the key
  // metrics — success (accuracy), reaction time, cognitive score, volume.
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const perGame = Object.entries(
    sessions.reduce<Record<string, SessionDoc[]>>((acc, s) => {
      (acc[s.gameId] ??= []).push(s);
      return acc;
    }, {})
  ).map(([gameId, list]) => {
    const acc = list.filter(
      (s): s is SessionDoc & { accuracy: number } => typeof s.accuracy === 'number'
    );
    const scored = list.filter(s => s.report?.cognitiveScore != null);
    return {
      gameId,
      name:     gameLabel(gameId),
      sessions: list.length,
      users:    new Set(list.map(s => s.userId)).size,
      accuracy: acc.length ? Math.round(mean(acc.map(s => s.accuracy)) * 100) : null,
      reaction: acc.length ? Math.round(mean(acc.map(s => s.avgReactionMs))) : null,
      score:    scored.length ? Math.round(mean(scored.map(s => s.report!.cognitiveScore))) : null,
    };
  }).sort((a, b) => b.sessions - a.sessions);

  // ── Compare (section 2): user-vs-user OR group-vs-group, with real per-game
  //    graphs. Two "entities" (two chosen users, or two+ demographic buckets)
  //    are each reduced to a per-game metric mean from the loaded sessions.
  const CMP_COLORS = ['#6366f1', '#f59e0b', '#0ea5e9', '#10b981', '#ec4899'];
  const cmpUnit = cmpMetric === 'accuracy' ? '%' : cmpMetric === 'reaction' ? 'ms' : '';
  const cmpLowerBetter = cmpMetric === 'reaction';   // faster reaction = better

  const metricOf = (s: SessionDoc): number | null => {
    if (cmpMetric === 'accuracy') return typeof s.accuracy === 'number' ? s.accuracy * 100 : null;
    if (cmpMetric === 'score')    return s.report?.cognitiveScore ?? null;
    return typeof s.accuracy === 'number' && s.avgReactionMs > 0 ? s.avgReactionMs : null; // reaction
  };
  const meanMetric = (list: SessionDoc[]): number | null => {
    const vals = list.map(metricOf).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  const cmpLabel = (dim: 'gender' | 'age', id: string) =>
    id === '__unknown__'
      ? t('cmp.unknown')
      : t(`${dim === 'age' ? 'age' : 'gender'}.${id}` as Parameters<typeof t>[0]);

  // Users present in the loaded sessions (for the two user pickers).
  const cmpUsers = Object.values(
    sessions.reduce<Record<string, { id: string; label: string }>>((acc, s) => {
      if (s.userId && !acc[s.userId]) {
        acc[s.userId] = { id: s.userId, label: s.username || s.userId.slice(0, 6) };
      }
      return acc;
    }, {})
  ).sort((a, b) => a.label.localeCompare(b.label));

  // Demographic buckets actually present, in canonical order.
  const bucketOrder = cmpDim === 'age'
    ? ['under-50', '50-60', '61-70', '71-80', 'over-80']
    : ['male', 'female', 'other-undisclosed'];
  const bucketOf = (s: SessionDoc) => (cmpDim === 'age' ? s.ageGroup : s.gender) || '__unknown__';
  const cmpBucketsPresent = [...bucketOrder, '__unknown__']
    .filter(id => sessions.some(s => bucketOf(s) === id));

  // Resolve selections with sensible defaults (first two users / all buckets).
  const userA = cmpUserA || cmpUsers[0]?.id || '';
  const userB = cmpUserB || cmpUsers[1]?.id || '';
  const selectedGroups = cmpGroups.length ? cmpGroups : cmpBucketsPresent;

  type CmpEntity = { key: string; label: string; color: string; sessions: SessionDoc[] };
  const cmpEntities: CmpEntity[] = cmpMode === 'users'
    ? [userA, userB]
        .filter((id, i, a) => id && a.indexOf(id) === i)
        .map((id, i) => ({
          key: id,
          label: cmpUsers.find(u => u.id === id)?.label ?? id.slice(0, 6),
          color: CMP_COLORS[i % CMP_COLORS.length],
          sessions: sessions.filter(s => s.userId === id),
        }))
    : selectedGroups.map((bucket, i) => ({
        key: bucket,
        label: cmpLabel(cmpDim, bucket),
        color: CMP_COLORS[i % CMP_COLORS.length],
        sessions: sessions.filter(s => bucketOf(s) === bucket),
      }));

  const inScope = (list: SessionDoc[]) =>
    cmpGame === 'all' ? list : list.filter(s => s.gameId === cmpGame);

  // Games axis: the single chosen game, or every game any entity has played,
  // ordered by overall popularity (perGame is already sorted by volume).
  const cmpGames = cmpGame === 'all'
    ? perGame.map(g => g.gameId).filter(gid => cmpEntities.some(e => e.sessions.some(s => s.gameId === gid)))
    : [cmpGame];

  // Per-game chart rows: { game, [entityKey]: metricMean } — feeds bars + radar.
  const cmpChartData = cmpGames.map(gid => {
    const row: Record<string, string | number | null> = { game: gameLabel(gid) };
    cmpEntities.forEach(e => { row[e.key] = meanMetric(e.sessions.filter(s => s.gameId === gid)); });
    return row;
  });

  // Overall per entity (respecting the game filter) for the summary strip/table.
  const cmpOverall = cmpEntities.map(e => ({
    key: e.key,
    label: e.label,
    color: e.color,
    value: meanMetric(inScope(e.sessions)),
    sessionsCount: inScope(e.sessions).length,
  }));

  const cmpHasData = cmpOverall.some(e => e.value != null);
  const cmpShowRadar = cmpGame === 'all' && cmpGames.length >= 3 && cmpEntities.length >= 1;
  const cmpAxisDomain: [number, number] | undefined =
    cmpMetric === 'reaction' ? undefined : [0, 100];

  const toggleGroup = (b: string) => {
    const base = cmpGroups.length ? cmpGroups : cmpBucketsPresent;
    const next = base.includes(b) ? base.filter(x => x !== b) : [...base, b];
    setCmpGroups(next.length ? next : []);
  };

  // Line chart: cognitive scores over last 20 sessions that have a report
  const scoreTimeline = reportsWithScore
    .slice(0, 20)
    .reverse()
    .map((s, i) => ({
      idx:   i + 1,
      score: s.report!.cognitiveScore,
      game:  gameLabel(s.gameId),
    }));

  // Token cost
  const tokenCost = tokenUsage
    ? (tokenUsage.totalInputTokens  * INPUT_COST_PER_TOKEN
     + tokenUsage.totalOutputTokens * OUTPUT_COST_PER_TOKEN).toFixed(4)
    : null;

  // Recent reports (last 5 with score)
  const recentReports = reportsWithScore.slice(0, 5);

  // ── Export (client-side, from the already-loaded data) ───────────────────────

  const downloadBlob = (filename: string, content: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const csvEscape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportCSV = () => {
    const cols = ['id', 'userId', 'username', 'gameId', 'startedAt', 'accuracy',
      'avgReactionMs', 'peakStreak', 'hits', 'misses', 'timeouts', 'cognitiveScore'];
    const rows = sessions.map(s => [
      s.id ?? '', s.userId, s.username ?? '', s.gameId,
      s.startedAt ? new Date(s.startedAt).toISOString() : '',
      s.accuracy ?? '', s.avgReactionMs, s.peakStreak, s.hits, s.misses, s.timeouts,
      s.report?.cognitiveScore ?? '',
    ]);
    const csv = [cols.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
    downloadBlob(`neurostep-sessions-${Date.now()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8;');
  };

  const exportJSON = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      kpis: { totalSessions, uniqueUsers, avgAccuracy, avgCogScore },
      accuracyByGame: byGame,
      tokenUsage,
      sessions,
    };
    downloadBlob(`neurostep-stats-${Date.now()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  // Per-game summary report (one row per game).
  const exportPerGameCSV = () => {
    const cols = ['gameId', 'name', 'sessions', 'users', 'accuracyPct', 'avgReactionMs', 'avgCognitiveScore'];
    const rows = perGame.map(g => [g.gameId, g.name, g.sessions, g.users, g.accuracy ?? '', g.reaction ?? '', g.score ?? '']);
    const csv = [cols.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
    downloadBlob(`neurostep-per-game-${Date.now()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8;');
  };

  // Detailed report for ONE game: every session of that game.
  const exportGameSessionsCSV = (gameId: string) => {
    const cols = ['id', 'userId', 'username', 'startedAt', 'accuracy', 'avgReactionMs',
      'peakStreak', 'hits', 'misses', 'timeouts', 'cognitiveScore'];
    const rows = sessions.filter(s => s.gameId === gameId).map(s => [
      s.id ?? '', s.userId, s.username ?? '',
      s.startedAt ? new Date(s.startedAt).toISOString() : '',
      s.accuracy ?? '', s.avgReactionMs, s.peakStreak, s.hits, s.misses, s.timeouts,
      s.report?.cognitiveScore ?? '',
    ]);
    const csv = [cols.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
    downloadBlob(`neurostep-${gameId}-${Date.now()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8;');
  };

  // Comparison report: a matrix of game rows × one column per entity (plus an
  // OVERALL row), for the current mode/metric/game selection.
  const exportComparisonCSV = () => {
    const cols = ['metric', 'unit', 'game', ...cmpEntities.map(e => e.label)];
    const gameRows = cmpChartData.map(row => [
      cmpMetric, cmpUnit, row.game,
      ...cmpEntities.map(e => (row[e.key] ?? '')),
    ]);
    const overallRow = [cmpMetric, cmpUnit, 'OVERALL', ...cmpOverall.map(o => o.value ?? '')];
    const csv = [cols, ...gameRows, overallRow].map(r => r.map(csvEscape).join(',')).join('\n');
    downloadBlob(`neurostep-compare-${cmpMode}-${cmpMetric}-${Date.now()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8;');
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>Statistics</h2>
        <button className="back-btn" onClick={onBack}>← Back</button>
      </div>
      <p className="stats-loading">{t('st.loading')}</p>
    </div>
  );

  if (error) return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>Statistics</h2>
        <button className="back-btn" onClick={onBack}>← Back</button>
      </div>
      <div className="stats-error">
        <strong>{t('st.errorTitle')}</strong>
        <code>{error}</code>
        <p>{t('st.errorHint')}</p>
      </div>
    </div>
  );

  return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>Statistics</h2>
        <div className="stats-actions">
          <button className="export-btn" onClick={exportCSV} disabled={sessions.length === 0}>
            ⬇ CSV
          </button>
          <button className="export-btn" onClick={exportJSON} disabled={sessions.length === 0}>
            ⬇ JSON
          </button>
          <button className="back-btn" onClick={onBack}>← Back</button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="kpi-row">
        <div className="kpi-card">
          <span className="kpi-label">{t('st.sessions')}</span>
          <span className="kpi-value">{totalSessions}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">{t('st.uniqueUsers')}</span>
          <span className="kpi-value">{uniqueUsers}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">{t('st.avgAccuracy')}</span>
          <span className="kpi-value">{avgAccuracy}%</span>
        </div>
        <div className="kpi-card kpi-highlight">
          <span className="kpi-label">{t('st.avgScore')}</span>
          <span className="kpi-value">{avgCogScore ?? '—'}</span>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="charts-row">

        {/* Accuracy per game */}
        <div className="chart-card">
          <h3 className="chart-title">{t('st.accByGame')}</h3>
          {byGame.length === 0
            ? <p className="chart-empty">{t('st.noData')}</p>
            : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byGame} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip formatter={(v) => `${v ?? 0}%`} />
                  <Bar dataKey="accuracy" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Cognitive score over time */}
        <div className="chart-card">
          <h3 className="chart-title">{t('st.scoreOverTime')}</h3>
          {scoreTimeline.length === 0
            ? <p className="chart-empty">{t('st.noReportsPlay')}</p>
            : <ResponsiveContainer width="100%" height={200}>
                <LineChart data={scoreTimeline} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="idx" tick={{ fontSize: 12 }} label={{ value: t('st.session'), position: 'insideBottom', offset: -2, fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v) => [`${v ?? '—'}`, t('common.score')]}
                    labelFormatter={(l) => `${t('st.session')} ${l}`}
                  />
                  <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
          }
        </div>
      </div>

      {/* ── Per-game success breakdown (section 1) ── */}
      <div className="pergame-card">
        <div className="pergame-head">
          <div>
            <h3 className="chart-title">{t('sg.title')}</h3>
            <p className="pergame-sub">{t('sg.sub')}</p>
          </div>
          <button className="export-btn" onClick={exportPerGameCSV} disabled={perGame.length === 0}>
            {t('sg.reportAll')}
          </button>
        </div>
        {perGame.length === 0 ? (
          <p className="chart-empty">{t('sg.empty')}</p>
        ) : (
          <div className="pergame-scroll">
            <table className="pergame-table">
              <thead>
                <tr>
                  <th>{t('sg.game')}</th>
                  <th>{t('sg.sessions')}</th>
                  <th>{t('sg.users')}</th>
                  <th>{t('sg.accuracy')}</th>
                  <th>{t('sg.reaction')}</th>
                  <th>{t('sg.score')}</th>
                  <th aria-label={t('sg.report')} />
                </tr>
              </thead>
              <tbody>
                {perGame.map((g) => (
                  <tr key={g.gameId}>
                    <td className="pg-game">{g.name}</td>
                    <td>{g.sessions}</td>
                    <td>{g.users}</td>
                    <td>
                      {g.accuracy == null ? '—' : (
                        <span className={`pg-acc pg-${scoreClass(g.accuracy)}`}>{g.accuracy}%</span>
                      )}
                    </td>
                    <td>{g.reaction == null ? '—' : g.reaction}</td>
                    <td>{g.score == null ? '—' : (
                      <span className={`pg-acc pg-${scoreClass(g.score)}`}>{g.score}</span>
                    )}</td>
                    <td>
                      <button
                        className="pg-report-btn"
                        onClick={() => exportGameSessionsCSV(g.gameId)}
                        title={t('sg.report')}
                      >
                        {t('sg.report')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Compare users (section 2) ── */}
      <div className="pergame-card">
        <div className="pergame-head">
          <div>
            <h3 className="chart-title">{t('cmp.title')}</h3>
            <p className="pergame-sub">{t('cmp.sub')}</p>
          </div>
          <button className="export-btn" onClick={exportComparisonCSV} disabled={!cmpHasData}>
            {t('cmp.report')}
          </button>
        </div>

        {/* mode toggle: user-vs-user or group-vs-group */}
        <div className="cmp-modes" role="tablist">
          <button
            role="tab" aria-selected={cmpMode === 'users'}
            className={`cmp-mode ${cmpMode === 'users' ? 'active' : ''}`}
            onClick={() => setCmpMode('users')}
          >{t('cmp.mode.users')}</button>
          <button
            role="tab" aria-selected={cmpMode === 'groups'}
            className={`cmp-mode ${cmpMode === 'groups' ? 'active' : ''}`}
            onClick={() => setCmpMode('groups')}
          >{t('cmp.mode.groups')}</button>
        </div>

        {/* controls: metric + game, plus the mode-specific pickers */}
        <div className="cmp-controls">
          <label className="cmp-field">
            <span>{t('cmp.metric')}</span>
            <select value={cmpMetric} onChange={e => setCmpMetric(e.target.value as 'accuracy' | 'score' | 'reaction')}>
              <option value="accuracy">{t('cmp.metric.accuracy')}</option>
              <option value="score">{t('cmp.metric.score')}</option>
              <option value="reaction">{t('cmp.metric.reaction')}</option>
            </select>
          </label>
          <label className="cmp-field">
            <span>{t('cmp.game')}</span>
            <select value={cmpGame} onChange={e => setCmpGame(e.target.value)}>
              <option value="all">{t('cmp.allGames')}</option>
              {perGame.map(g => <option key={g.gameId} value={g.gameId}>{g.name}</option>)}
            </select>
          </label>

          {cmpMode === 'users' ? (
            <>
              <label className="cmp-field">
                <span>{t('cmp.userA')}</span>
                <select value={userA} onChange={e => setCmpUserA(e.target.value)}>
                  {cmpUsers.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </label>
              <label className="cmp-field">
                <span>{t('cmp.userB')}</span>
                <select value={userB} onChange={e => setCmpUserB(e.target.value)}>
                  {cmpUsers.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </label>
            </>
          ) : (
            <label className="cmp-field">
              <span>{t('cmp.dim')}</span>
              <select value={cmpDim} onChange={e => { setCmpDim(e.target.value as 'gender' | 'age'); setCmpGroups([]); }}>
                <option value="age">{t('cmp.dim.age')}</option>
                <option value="gender">{t('cmp.dim.gender')}</option>
              </select>
            </label>
          )}
        </div>

        {/* group mode: pick which buckets to compare (chips) */}
        {cmpMode === 'groups' && (
          <div className="cmp-chips">
            <span className="cmp-chips-label">{t('cmp.selectGroups')}</span>
            {cmpBucketsPresent.map(b => (
              <button
                key={b}
                className={`cmp-chip ${selectedGroups.includes(b) ? 'active' : ''}`}
                onClick={() => toggleGroup(b)}
              >{cmpLabel(cmpDim, b)}</button>
            ))}
          </div>
        )}

        {/* legend + overall summary tiles */}
        {cmpHasData && (
          <div className="cmp-summary">
            {cmpOverall.map(o => (
              <div key={o.key} className="cmp-tile" style={{ borderColor: o.color }}>
                <span className="cmp-tile-dot" style={{ background: o.color }} />
                <span className="cmp-tile-label">{o.label}</span>
                <span className="cmp-tile-value">{o.value == null ? '—' : `${o.value}${cmpUnit}`}</span>
                <span className="cmp-tile-sub">{o.sessionsCount} {t('cmp.sessions')}</span>
              </div>
            ))}
            {cmpLowerBetter && <span className="cmp-note">{t('cmp.lowerBetter')}</span>}
          </div>
        )}

        {!cmpHasData ? (
          <p className="chart-empty">
            {cmpMode === 'users' && cmpUsers.length < 2 ? t('cmp.needUsers') : t('cmp.empty')}
          </p>
        ) : (
          <>
            {/* grouped bars: per game, one bar per entity */}
            <h4 className="cmp-chart-title">{t('cmp.byGame')}</h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cmpChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="game" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} unit={cmpUnit} domain={cmpAxisDomain} />
                <Tooltip formatter={(v) => `${v ?? '—'}${cmpUnit}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {cmpEntities.map(e => (
                  <Bar key={e.key} dataKey={e.key} name={e.label} fill={e.color} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {/* radar: holistic profile across games (only when comparing many games) */}
            {cmpShowRadar && (
              <>
                <h4 className="cmp-chart-title">{t('cmp.radarTitle')}</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={cmpChartData} outerRadius="72%">
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="game" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={cmpAxisDomain} tick={{ fontSize: 10 }} angle={90} />
                    <Tooltip formatter={(v) => `${v ?? '—'}${cmpUnit}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {cmpEntities.map(e => (
                      <Radar key={e.key} dataKey={e.key} name={e.label}
                        stroke={e.color} fill={e.color} fillOpacity={0.22} />
                    ))}
                  </RadarChart>
                </ResponsiveContainer>
              </>
            )}

            {/* matrix table: game rows × entity columns */}
            <div className="pergame-scroll">
              <table className="pergame-table">
                <thead>
                  <tr>
                    <th>{t('cmp.game')}</th>
                    {cmpEntities.map(e => (
                      <th key={e.key}><span className="cmp-th-dot" style={{ background: e.color }} />{e.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cmpChartData.map((row, i) => (
                    <tr key={i}>
                      <td className="pg-game">{row.game}</td>
                      {cmpEntities.map(e => (
                        <td key={e.key}>{row[e.key] == null ? '—' : `${row[e.key]}${cmpUnit}`}</td>
                      ))}
                    </tr>
                  ))}
                  <tr className="cmp-overall-row">
                    <td className="pg-game">{t('cmp.overall')}</td>
                    {cmpOverall.map(o => (
                      <td key={o.key}>{o.value == null ? '—' : `${o.value}${cmpUnit}`}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Claude token usage ── */}
      <div className="token-card">
        <h3 className="chart-title">{t('st.claudeUsage')}</h3>
        {tokenUsage ? (
          <div className="token-grid">
            <div className="token-stat">
              <span className="token-label">{t('st.reportsGenerated')}</span>
              <span className="token-num">{tokenUsage.totalReports.toLocaleString()}</span>
            </div>
            <div className="token-stat">
              <span className="token-label">Input tokens</span>
              <span className="token-num">{tokenUsage.totalInputTokens.toLocaleString()}</span>
            </div>
            <div className="token-stat">
              <span className="token-label">Output tokens</span>
              <span className="token-num">{tokenUsage.totalOutputTokens.toLocaleString()}</span>
            </div>
            <div className="token-stat token-cost">
              <span className="token-label">{t('st.estCost')}</span>
              <span className="token-num">${tokenCost}</span>
            </div>
          </div>
        ) : (
          <p className="chart-empty">{t('st.noUsage')}</p>
        )}
      </div>

      {/* ── Recent Claude reports ── */}
      <div className="reports-card">
        <h3 className="chart-title">{t('st.recentReports')}</h3>
        {recentReports.length === 0
          ? <p className="chart-empty">{t('st.noReports')}</p>
          : recentReports.map((s, i) => (
            <div key={i} className="report-row">
              <div className="report-meta">
                <span className="report-game">{gameLabel(s.gameId)}</span>
                <span className={`report-score score-${scoreClass(s.report!.cognitiveScore)}`}>
                  {s.report!.cognitiveScore}/100
                </span>
              </div>
              <p className="report-summary">{s.report!.summaryHe}</p>
            </div>
          ))
        }
      </div>
    </div>
  );
};

function scoreClass(score: number) {
  if (score >= 70) return 'good';
  if (score >= 40) return 'mid';
  return 'low';
}

export default AdminStats;
