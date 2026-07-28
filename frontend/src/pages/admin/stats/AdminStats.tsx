import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
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
