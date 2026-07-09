import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChevronRight, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import './PlayerFilePage.css';

// ─── Types ────────────────────────────────────────────────────────

interface DomainDoc {
  id:                 string;
  level?:             number;
  trend?:             'up' | 'down' | 'stable';
  deteriorationFlag?: boolean;
  bestLevel?:         number;
}

interface SessionRow {
  sessionId:      string;
  gameId:         string | null;
  generatedAt:    number | null;
  cognitiveScore: number | null;
  accuracy:       number | null;
  summaryHe:      string;
}

interface AlertRow {
  alertId:      string | null;
  gameId:       string;
  type:         string;
  trigger:      string | null;
  accuracyDrop: number | null;
  createdAt:    number | null;
  acknowledged: boolean;
}

interface TrainingPlanItem {
  domainId:        string;
  domainHe:        string;
  gameId:          string;
  gameHe:          string;
  level:           number;
  trend:           'up' | 'down' | 'stable';
  deterioration:   boolean;
  priority:        'high' | 'medium' | 'low';
  priorityHe:      string;
  sessionsPerWeek: number;
  reasonHe:        string;
}

interface TrainingPlan {
  items:          TrainingPlanItem[];
  weeklySessions: number;
  focusDomainHe:  string | null;
  isColdStart:    boolean;
}

interface PlayerFile {
  user: {
    id:         string;
    name?:      string;
    email?:     string;
    role?:      string;
    createdAt:  number | null;
  };
  profile:      { domains: DomainDoc[] };
  progression:  { overallLevel?: number; rank?: string; avatarState?: string };
  sessions:     SessionRow[];
  alerts:       AlertRow[];
  trainingPlan?: TrainingPlan;
}

interface SessionReport {
  sessionId:         string;
  gameId:            string;
  generatedAt:       number | null;
  startedAt:         number | null;
  cognitiveScore:    number | null;
  domainScores:      Record<string, number>;
  summaryHe:         string;
  strengthsHe?:      string[];
  recommendationsHe?: string[];
  rawStats?: {
    accuracy?:        number | null;
    avgReactionMs?:   number | null;
    peakStreak?:      number | null;
    durationMs?:      number | null;
    adjustmentCount?: number | null;
    netDirection?:    'harder' | 'easier' | 'stable' | null;
  };
}

// ─── Constants ────────────────────────────────────────────────────

const DOMAIN_HE: Record<string, string> = {
  'working-memory':      'זיכרון עבודה',
  'selective-attention': 'קשב סלקטיבי',
  'divided-attention':   'קשב מחולק',
  'processing-speed':    'מהירות עיבוד',
  'reaction-time':       'זמן תגובה',
  'response-inhibition': 'עיכוב תגובה',
  'strategic-thinking':  'חשיבה אסטרטגית',
  'visual-spatial':      'חשיבה חזותית-מרחבית',
};

// Shorter labels so the radar axis stays legible.
const DOMAIN_SHORT_HE: Record<string, string> = {
  'working-memory':      'זיכרון',
  'selective-attention': 'קשב סלקטיבי',
  'divided-attention':   'קשב מחולק',
  'processing-speed':    'מהירות',
  'reaction-time':       'תגובה',
  'response-inhibition': 'עיכוב',
  'strategic-thinking':  'אסטרטגיה',
  'visual-spatial':      'מרחבי',
};

// Canonical domain order (matches the 8-game cognitive model).
const DOMAIN_ORDER = [
  'working-memory', 'selective-attention', 'divided-attention', 'processing-speed',
  'reaction-time', 'response-inhibition', 'strategic-thinking', 'visual-spatial',
];

const GAME_HE: Record<string, string> = {
  'memory':          'זיכרון',
  'find-letter':     'מצא את האותיות',
  'color-trains':    'רכבות צבעוניות',
  'spot-difference': 'מצא את ההבדל',
  'green-light':     'אור ירוק',
  'shapes-click':    'צורות קופצות',
  'tictactoe':       'איקס עיגול',
  'where-was-it':    'איפה זה היה',
};

const RANK_HE: Record<string, string> = {
  beginner:     'מתחיל',
  intermediate: 'מתקדם',
  advanced:     'מומחה',
  expert:       'אלוף',
};

const NET_DIR_HE: Record<string, string> = {
  harder: 'הוקשה',
  easier: 'הוקלה',
  stable: 'יציבה',
};

// ─── Helpers ──────────────────────────────────────────────────────

function scoreClass(score: number | null): 'good' | 'mid' | 'low' | 'na' {
  if (score === null) return 'na';
  if (score >= 70)    return 'good';
  if (score >= 40)    return 'mid';
  return 'low';
}

function formatDate(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return '—';
  return new Date(ts).toLocaleDateString('he-IL', {
    day: 'numeric', month: 'numeric', year: 'numeric',
  });
}

function trendArrow(trend?: string): { char: string; cls: string } {
  if (trend === 'up')   return { char: '▲', cls: 'up' };
  if (trend === 'down') return { char: '▼', cls: 'down' };
  return { char: '=', cls: 'flat' };
}

function gameHe(id: string | null): string {
  if (!id) return '—';
  return GAME_HE[id] ?? id;
}

// ─── Component ────────────────────────────────────────────────────

export default function PlayerFilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [data,    setData]    = useState<PlayerFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Report drawer state
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [report,        setReport]        = useState<SessionReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError,   setReportError]   = useState<string | null>(null);

  // ── Auth gate (admin-only) ────────────────────────────────────
  if (!isAdmin) return <Navigate to="/" />;

  const fetchPlayerFile = async () => {
    if (!userId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/player-file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as PlayerFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayerFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const openReport = async (sessionId: string) => {
    if (!token) return;
    setOpenSessionId(sessionId);
    setReport(null);
    setReportError(null);
    setReportLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport((await res.json()) as SessionReport);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'שגיאה בטעינת הדוח');
    } finally {
      setReportLoading(false);
    }
  };

  const closeReport = () => {
    setOpenSessionId(null);
    setReport(null);
    setReportError(null);
  };

  // ── Derived: radar + trend datasets ───────────────────────────
  const domainMap = useMemo(() => {
    const m = new Map<string, DomainDoc>();
    data?.profile.domains.forEach((d) => m.set(d.id, d));
    return m;
  }, [data]);

  const radarData = useMemo(() =>
    DOMAIN_ORDER.map((id) => ({
      domain: DOMAIN_SHORT_HE[id] ?? id,
      level:  domainMap.get(id)?.level ?? 0,
    })), [domainMap]);

  const trendData = useMemo(() => {
    if (!data) return [];
    return [...data.sessions]
      .filter((s) => s.generatedAt !== null && typeof s.cognitiveScore === 'number')
      .sort((a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0))
      .map((s) => ({ date: formatDate(s.generatedAt), score: s.cognitiveScore }));
  }, [data]);

  // ── Render: header (used across states) ───────────────────────
  const rank = data?.progression.rank;
  const Header = (
    <div className="pf-header">
      <div>
        <h1>תיק שחקן</h1>
        <p className="pf-subtitle">
          {data?.user.name ? `${data.user.name} · ` : ''}{userId}
        </p>
      </div>
      <button className="pf-back-btn" onClick={() => navigate(-1)}>
        <ChevronRight size={14} />
        חזור
      </button>
    </div>
  );

  if (loading) {
    return (
      <main className="pf-page" dir="rtl">
        {Header}
        <div className="pf-state"><p>טוען נתונים…</p></div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="pf-page" dir="rtl">
        {Header}
        <div className="pf-state pf-error">
          <span className="pf-emoji">⚠️</span>
          <h2>לא הצלחנו לטעון את התיק</h2>
          <p>{error}</p>
          <button className="pf-retry-btn" onClick={fetchPlayerFile}>נסה שוב</button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="pf-page" dir="rtl">
      {Header}

      {/* ── Identity strip ── */}
      <section className="pf-identity">
        <div className="pf-avatar" aria-hidden>
          {(data.user.name ?? '?').trim().charAt(0).toUpperCase() || '?'}
        </div>
        <div className="pf-identity-main">
          <div className="pf-identity-name">{data.user.name ?? '—'}</div>
          <div className="pf-identity-sub">{data.user.email ?? ''}</div>
          <div className="pf-identity-meta">
            <span>הצטרף: {formatDate(data.user.createdAt)}</span>
            <span className={`pf-role ${data.user.role ?? 'user'}`}>
              {data.user.role === 'admin' ? 'מנהל' : 'משתמש'}
            </span>
          </div>
        </div>
        <div className="pf-identity-stats">
          <div className="pf-stat">
            <span className="pf-stat-value">{data.progression.overallLevel ?? 0}</span>
            <span className="pf-stat-label">רמה כללית</span>
          </div>
          <div className="pf-stat">
            <span className="pf-stat-value">{rank ? (RANK_HE[rank] ?? rank) : '—'}</span>
            <span className="pf-stat-label">דרגה</span>
          </div>
          <div className="pf-stat">
            <span className="pf-stat-value">{data.sessions.length}</span>
            <span className="pf-stat-label">משחקים אחרונים</span>
          </div>
        </div>
      </section>

      {/* ── Quick links to the deeper per-user pages ── */}
      <div className="pf-quicklinks">
        <button onClick={() => navigate(`/admin/users/${userId}/trend`)}>מגמה קוגניטיבית</button>
        <button onClick={() => navigate(`/admin/users/${userId}/coach-reports`)}>דוחות מאמן</button>
      </div>

      {/* ── Cognitive profile (radar + per-domain bars) ── */}
      <section className="pf-card">
        <h2 className="pf-card-title">פרופיל קוגניטיבי</h2>
        {data.profile.domains.length === 0 ? (
          <p className="pf-muted">עדיין אין פרופיל — המשתמש טרם השלים משחקים.</p>
        ) : (
          <div className="pf-profile-grid">
            <div className="pf-radar-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: '#475569' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} angle={90} />
                  <Radar dataKey="level" stroke="#2f86d6" fill="#2f86d6" fillOpacity={0.35} />
                  <Tooltip
                    contentStyle={{ direction: 'rtl', textAlign: 'right' }}
                    formatter={(v) => [`${v}/100`, 'רמה']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <ul className="pf-domain-list">
              {DOMAIN_ORDER.map((id) => {
                const d = domainMap.get(id);
                const level = d?.level ?? 0;
                const arrow = trendArrow(d?.trend);
                return (
                  <li className="pf-domain-row" key={id}>
                    <span className="pf-domain-name">{DOMAIN_HE[id] ?? id}</span>
                    <span className="pf-domain-bar">
                      <span
                        className={`pf-domain-fill score-${scoreClass(d ? level : null)}`}
                        style={{ width: `${level}%` }}
                      />
                    </span>
                    <span className="pf-domain-level">{d ? level : '—'}</span>
                    <span className={`pf-domain-trend ${arrow.cls}`} title="מגמה">
                      {d?.deteriorationFlag ? '⚠' : arrow.char}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* ── Weekly training plan (derived from the profile) ── */}
      {data.trainingPlan && data.trainingPlan.items.length > 0 && (
        <section className="pf-card">
          <div className="pf-plan-head">
            <h2 className="pf-card-title">תוכנית אימונים שבועית</h2>
            <span className="pf-plan-total">
              {data.trainingPlan.weeklySessions} משחקים/שבוע
              {data.trainingPlan.focusDomainHe ? ` · דגש: ${data.trainingPlan.focusDomainHe}` : ''}
            </span>
          </div>
          <p className="pf-card-subtitle">נגזרת מהפרופיל — דומיינים חלשים או במגמת ירידה מקבלים עדיפות ותדירות גבוהה יותר.</p>
          <ul className="pf-plan-list">
            {data.trainingPlan.items.map((it) => (
              <li className={`pf-plan-row prio-${it.priority}`} key={it.domainId}>
                <span className={`pf-plan-badge prio-${it.priority}`}>{it.priorityHe}</span>
                <div className="pf-plan-main">
                  <div className="pf-plan-title">
                    <span className="pf-plan-domain">{it.domainHe}</span>
                    <span className="pf-plan-game">→ {it.gameHe}</span>
                  </div>
                  <p className="pf-plan-reason">{it.reasonHe}</p>
                </div>
                <span className="pf-plan-freq">
                  <span className="pf-plan-freq-num">{it.sessionsPerWeek}×</span>
                  <span className="pf-plan-freq-label">בשבוע</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Cognitive-score trend (recent sessions) ── */}
      {trendData.length > 0 && (
        <section className="pf-card">
          <h2 className="pf-card-title">מגמת ציון קוגניטיבי</h2>
          <p className="pf-card-subtitle">משחקים אחרונים · סולם 0–100 · 40 = ממוצע · 70 = חזק</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData} margin={{ top: 8, right: 18, left: -6, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} reversed />
              <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fontSize: 12 }} />
              <ReferenceLine y={40} stroke="#fbbf24" strokeDasharray="4 4" />
              <ReferenceLine y={70} stroke="#16a34a" strokeDasharray="4 4" />
              <Tooltip
                contentStyle={{ direction: 'rtl', textAlign: 'right' }}
                formatter={(v) => [v === null || v === undefined ? '—' : `${v}/100`, 'ציון']}
              />
              <Line type="monotone" dataKey="score" stroke="#2f86d6" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* ── Open alerts ── */}
      {data.alerts.length > 0 && (
        <section className="pf-card">
          <h2 className="pf-card-title">התראות פתוחות</h2>
          <ul className="pf-alert-list">
            {data.alerts.map((a, i) => (
              <li className="pf-alert-row" key={a.alertId ?? i}>
                <span className="pf-alert-dot" aria-hidden>●</span>
                <span className="pf-alert-game">{gameHe(a.gameId)}</span>
                <span className="pf-alert-text">
                  {a.trigger === 'accuracy'
                    ? `ירידה של ${a.accuracyDrop ?? '?'} נק' בדיוק`
                    : a.trigger === 'cognitive_score'
                    ? 'ירידה בציון הקוגניטיבי'
                    : 'דפוס ירידה זוהה'}
                </span>
                <span className="pf-alert-date">{formatDate(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Session history (click → report drawer) ── */}
      <section className="pf-card">
        <h2 className="pf-card-title">היסטוריית משחקים</h2>
        {data.sessions.length === 0 ? (
          <p className="pf-muted">אין עדיין משחקים.</p>
        ) : (
          <div className="pf-session-list">
            {data.sessions.map((s) => (
              <button
                className="pf-session-card"
                key={s.sessionId}
                onClick={() => openReport(s.sessionId)}
                aria-label={`פתח דוח ל${gameHe(s.gameId)}`}
              >
                <div className="pf-session-meta">
                  <span className="pf-session-game">{gameHe(s.gameId)}</span>
                  <span className="pf-session-date">{formatDate(s.generatedAt)}</span>
                  <span className="pf-session-acc">
                    דיוק: {s.accuracy === null ? '—' : `${Math.round(s.accuracy * 100)}%`}
                  </span>
                </div>
                <span className={`pf-session-score score-${scoreClass(s.cognitiveScore)}`}>
                  {s.cognitiveScore === null ? '—' : `${s.cognitiveScore}/100`}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Report drawer ── */}
      {openSessionId && (
        <div className="pf-drawer-overlay" onClick={closeReport}>
          <aside className="pf-drawer" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="pf-drawer-head">
              <h2>דוח סשן</h2>
              <button className="pf-drawer-close" onClick={closeReport} aria-label="סגור">
                <X size={18} />
              </button>
            </div>

            {reportLoading && <p className="pf-muted">טוען דוח…</p>}
            {reportError && <p className="pf-error-text">{reportError}</p>}

            {report && (
              <div className="pf-report">
                <div className="pf-report-top">
                  <span className="pf-report-game">{gameHe(report.gameId)}</span>
                  <span className={`pf-session-score score-${scoreClass(report.cognitiveScore)}`}>
                    {report.cognitiveScore ?? '—'}/100
                  </span>
                </div>
                <p className="pf-report-date">{formatDate(report.generatedAt)}</p>

                {report.summaryHe && <p className="pf-report-summary">{report.summaryHe}</p>}

                {report.domainScores && Object.keys(report.domainScores).length > 0 && (
                  <>
                    <h3 className="pf-report-h3">ציוני דומיינים</h3>
                    <ul className="pf-report-domains">
                      {Object.entries(report.domainScores).map(([id, v]) => (
                        <li key={id}>
                          <span>{DOMAIN_HE[id] ?? id}</span>
                          <span className={`score-${scoreClass(v)}`}>{v}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {report.strengthsHe && report.strengthsHe.length > 0 && (
                  <>
                    <h3 className="pf-report-h3">חוזקות</h3>
                    <ul className="pf-report-bullets">
                      {report.strengthsHe.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </>
                )}

                {report.recommendationsHe && report.recommendationsHe.length > 0 && (
                  <>
                    <h3 className="pf-report-h3">המלצות</h3>
                    <ul className="pf-report-bullets">
                      {report.recommendationsHe.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </>
                )}

                {report.rawStats && (
                  <>
                    <h3 className="pf-report-h3">נתונים גולמיים</h3>
                    <div className="pf-report-stats">
                      <div><span>דיוק</span><span>{report.rawStats.accuracy != null ? `${Math.round(report.rawStats.accuracy * 100)}%` : '—'}</span></div>
                      <div><span>זמן תגובה</span><span>{report.rawStats.avgReactionMs != null ? `${Math.round(report.rawStats.avgReactionMs)}ms` : '—'}</span></div>
                      <div><span>רצף שיא</span><span>{report.rawStats.peakStreak ?? '—'}</span></div>
                      <div><span>משך</span><span>{report.rawStats.durationMs != null ? `${Math.round(report.rawStats.durationMs / 1000)}s` : '—'}</span></div>
                      <div><span>התאמות קושי</span><span>{report.rawStats.adjustmentCount ?? 0}</span></div>
                      <div><span>מגמת קושי</span><span>{report.rawStats.netDirection ? (NET_DIR_HE[report.rawStats.netDirection] ?? report.rawStats.netDirection) : '—'}</span></div>
                    </div>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
