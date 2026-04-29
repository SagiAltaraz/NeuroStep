import { useEffect, useState } from 'react';
import {
  collection, getDocs, getDoc,
  query, orderBy, limit, doc,
} from 'firebase/firestore';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { db } from '../../../config/firebase';
import './AdminStats.css';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SessionDoc {
  userId:       string;
  gameId:       string;
  startedAt:    number;
  accuracy:     number;
  avgReactionMs: number;
  peakStreak:   number;
  hits:         number;
  misses:       number;
  timeouts:     number;
  report?: {
    cognitiveScore:    number;
    summaryHe:         string;
    strengthsHe:       string[];
    recommendationsHe: string[];
    generatedAt:       number;
  };
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

const GAME_LABELS: Record<string, string> = {
  'shapes-click': 'צורות',
  'color-trains': 'רכבות',
  'tictactoe':    'איקס עיגול',
  'memory':       'זיכרון',
};

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];

// ── Component ──────────────────────────────────────────────────────────────────

const AdminStats: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [sessions,    setSessions]    = useState<SessionDoc[]>([]);
  const [tokenUsage,  setTokenUsage]  = useState<TokenUsage | null>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Last 50 sessions ordered by start time
        const snap = await getDocs(
          query(collection(db, 'sessions'), orderBy('startedAt', 'desc'), limit(50))
        );
        const docs = snap.docs.map(d => d.data() as SessionDoc);
        setSessions(docs);

        // Token usage counter
        const tokenSnap = await getDoc(doc(db, 'meta', 'tokenUsage'));
        if (tokenSnap.exists()) setTokenUsage(tokenSnap.data() as TokenUsage);
      } catch (err) {
        console.error('[AdminStats] Firestore error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const totalSessions  = sessions.length;
  const uniqueUsers    = new Set(sessions.map(s => s.userId)).size;
  const avgAccuracy    = sessions.length
    ? Math.round((sessions.reduce((s, d) => s + d.accuracy, 0) / sessions.length) * 100)
    : 0;
  const reportsWithScore = sessions.filter(s => s.report?.cognitiveScore != null);
  const avgCogScore    = reportsWithScore.length
    ? Math.round(reportsWithScore.reduce((s, d) => s + d.report!.cognitiveScore, 0) / reportsWithScore.length)
    : null;

  // Bar chart: avg accuracy per game
  const byGame = Object.entries(
    sessions.reduce<Record<string, number[]>>((acc, s) => {
      (acc[s.gameId] ??= []).push(s.accuracy);
      return acc;
    }, {})
  ).map(([gameId, vals]) => ({
    name:     GAME_LABELS[gameId] ?? gameId,
    accuracy: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100),
  }));

  // Line chart: cognitive scores over last 20 sessions that have a report
  const scoreTimeline = reportsWithScore
    .slice(0, 20)
    .reverse()
    .map((s, i) => ({
      idx:   i + 1,
      score: s.report!.cognitiveScore,
      game:  GAME_LABELS[s.gameId] ?? s.gameId,
    }));

  // Token cost
  const tokenCost = tokenUsage
    ? (tokenUsage.totalInputTokens  * INPUT_COST_PER_TOKEN
     + tokenUsage.totalOutputTokens * OUTPUT_COST_PER_TOKEN).toFixed(4)
    : null;

  // Recent reports (last 5 with score)
  const recentReports = reportsWithScore.slice(0, 5);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>Statistics</h2>
        <button className="back-btn" onClick={onBack}>← Back</button>
      </div>
      <p className="stats-loading">טוען נתונים מ-Firestore…</p>
    </div>
  );

  return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>Statistics</h2>
        <button className="back-btn" onClick={onBack}>← Back</button>
      </div>

      {/* ── KPI row ── */}
      <div className="kpi-row">
        <div className="kpi-card">
          <span className="kpi-label">סשנים</span>
          <span className="kpi-value">{totalSessions}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">משתמשים ייחודיים</span>
          <span className="kpi-value">{uniqueUsers}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">דיוק ממוצע</span>
          <span className="kpi-value">{avgAccuracy}%</span>
        </div>
        <div className="kpi-card kpi-highlight">
          <span className="kpi-label">ציון קוגניטיבי ממוצע</span>
          <span className="kpi-value">{avgCogScore ?? '—'}</span>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="charts-row">

        {/* Accuracy per game */}
        <div className="chart-card">
          <h3 className="chart-title">דיוק לפי משחק</h3>
          {byGame.length === 0
            ? <p className="chart-empty">אין נתונים עדיין</p>
            : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byGame} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="accuracy" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Cognitive score over time */}
        <div className="chart-card">
          <h3 className="chart-title">ציון קוגניטיבי לאורך זמן</h3>
          {scoreTimeline.length === 0
            ? <p className="chart-empty">עדיין אין דוחות — שחק כדי ליצור</p>
            : <ResponsiveContainer width="100%" height={200}>
                <LineChart data={scoreTimeline} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="idx" tick={{ fontSize: 12 }} label={{ value: 'סשן', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: number) => [`${v}`, 'ציון']}
                    labelFormatter={(l) => `סשן ${l}`}
                  />
                  <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
          }
        </div>
      </div>

      {/* ── Claude token usage ── */}
      <div className="token-card">
        <h3 className="chart-title">שימוש ב-Claude API</h3>
        {tokenUsage ? (
          <div className="token-grid">
            <div className="token-stat">
              <span className="token-label">דוחות שנוצרו</span>
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
              <span className="token-label">עלות משוערת (Haiku)</span>
              <span className="token-num">${tokenCost}</span>
            </div>
          </div>
        ) : (
          <p className="chart-empty">אין שימוש עדיין — דוחות נוצרים בסוף כל סשן</p>
        )}
      </div>

      {/* ── Recent Claude reports ── */}
      <div className="reports-card">
        <h3 className="chart-title">דוחות קוגניטיביים אחרונים</h3>
        {recentReports.length === 0
          ? <p className="chart-empty">עדיין אין דוחות</p>
          : recentReports.map((s, i) => (
            <div key={i} className="report-row">
              <div className="report-meta">
                <span className="report-game">{GAME_LABELS[s.gameId] ?? s.gameId}</span>
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
