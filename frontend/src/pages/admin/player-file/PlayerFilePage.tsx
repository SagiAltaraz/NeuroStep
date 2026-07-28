import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChevronRight, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAdminT, type AdminKey } from '../adminI18n';
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

// Canonical domain order (matches the 8-game cognitive model).
const DOMAIN_ORDER = [
  'working-memory', 'selective-attention', 'divided-attention', 'processing-speed',
  'reaction-time', 'response-inhibition', 'strategic-thinking', 'visual-spatial',
];

// ─── Helpers ──────────────────────────────────────────────────────

function scoreClass(score: number | null): 'good' | 'mid' | 'low' | 'na' {
  if (score === null) return 'na';
  if (score >= 70)    return 'good';
  if (score >= 40)    return 'mid';
  return 'low';
}

function trendArrow(trend?: string): { char: string; cls: string } {
  if (trend === 'up')   return { char: '▲', cls: 'up' };
  if (trend === 'down') return { char: '▼', cls: 'down' };
  return { char: '=', cls: 'flat' };
}

/** Mirrors reasonHe() in backend/services/trainingPlan.js. */
function reasonKey(it: TrainingPlanItem): AdminKey {
  if (it.deterioration)   return 'reason.decline';
  if (it.trend === 'down') return 'reason.trendDown';
  if (it.level < 40)      return 'reason.weak';
  if (it.level < 70)      return 'reason.moderate';
  return 'reason.strong';
}

// ─── Component ────────────────────────────────────────────────────

export default function PlayerFilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();
  const {
    t, tdg, lang, dir, locale,
    gameLabel, domainLabel, domainShort, rankLabel, netDirLabel, priorityLabel,
  } = useAdminT();

  const [data,    setData]    = useState<PlayerFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Report drawer state
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [report,        setReport]        = useState<SessionReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError,   setReportError]   = useState<string | null>(null);

  const formatDate = useCallback((ts: number | null | undefined): string => {
    if (ts === null || ts === undefined) return '—';
    return new Date(ts).toLocaleDateString(locale, {
      day: 'numeric', month: 'numeric', year: 'numeric',
    });
  }, [locale]);

  const fetchPlayerFile = async () => {
    if (!userId || !token || !isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/player-file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as PlayerFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.loadError'));
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
      setReportError(err instanceof Error ? err.message : t('pf.reportError'));
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
      domain: domainShort(id),
      level:  domainMap.get(id)?.level ?? 0,
    })), [domainMap, domainShort]);

  const trendData = useMemo(() => {
    if (!data) return [];
    return [...data.sessions]
      .filter((s) => s.generatedAt !== null && typeof s.cognitiveScore === 'number')
      .sort((a, b) => (a.generatedAt ?? 0) - (b.generatedAt ?? 0))
      .map((s) => ({ date: formatDate(s.generatedAt), score: s.cognitiveScore }));
  }, [data, formatDate]);

  // ── Auth gate (admin-only) ────────────────────────────────────
  // Must sit below every hook: bailing out earlier would render a different
  // number of hooks if `isAdmin` ever flips, which React treats as an error.
  if (!isAdmin) return <Navigate to="/" />;

  // ── Render: header (used across states) ───────────────────────
  const rank = data?.progression.rank;
  const Header = (
    <div className="pf-header">
      <div>
        <h1>{t('pf.title')}</h1>
        <p className="pf-subtitle">
          {data?.user.name ? `${data.user.name} · ` : ''}{userId}
        </p>
      </div>
      <button className="pf-back-btn" onClick={() => navigate(-1)}>
        <ChevronRight size={14} />
        {t('common.back')}
      </button>
    </div>
  );

  if (loading) {
    return (
      <main className="pf-page" dir={dir}>
        {Header}
        <div className="pf-state"><p>{t('common.loading')}</p></div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="pf-page" dir={dir}>
        {Header}
        <div className="pf-state pf-error">
          <span className="pf-emoji">⚠️</span>
          <h2>{t('pf.loadError')}</h2>
          <p>{error}</p>
          <button className="pf-retry-btn" onClick={fetchPlayerFile}>{t('common.retry')}</button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const plan = data.trainingPlan;
  const focusDomain = lang === 'he'
    ? plan?.focusDomainHe
    : (plan?.items[0] ? domainLabel(plan.items[0].domainId) : null);

  return (
    <main className="pf-page" dir={dir}>
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
            <span>{t('pf.joined')}: {formatDate(data.user.createdAt)}</span>
            <span className={`pf-role ${data.user.role ?? 'user'}`}>
              {data.user.role === 'admin' ? t('common.admin') : t('common.user')}
            </span>
          </div>
        </div>
        <div className="pf-identity-stats">
          <div className="pf-stat">
            <span className="pf-stat-value">{data.progression.overallLevel ?? 0}</span>
            <span className="pf-stat-label">{t('pf.overallLevel')}</span>
          </div>
          <div className="pf-stat">
            <span className="pf-stat-value">{rank ? rankLabel(rank) : '—'}</span>
            <span className="pf-stat-label">{t('pf.rank')}</span>
          </div>
          <div className="pf-stat">
            <span className="pf-stat-value">{data.sessions.length}</span>
            <span className="pf-stat-label">{t('pf.recentGames')}</span>
          </div>
        </div>
      </section>

      {/* ── Quick links to the deeper per-user pages ── */}
      <div className="pf-quicklinks">
        <button onClick={() => navigate(`/admin/users/${userId}/trend`)}>{t('pf.linkTrend')}</button>
        <button onClick={() => navigate(`/admin/users/${userId}/coach-reports`)}>{t('pf.linkReports')}</button>
      </div>

      {/* ── Cognitive profile (radar + per-domain bars) ── */}
      <section className="pf-card">
        <h2 className="pf-card-title">{t('pf.profile')}</h2>
        {data.profile.domains.length === 0 ? (
          <p className="pf-muted">{t('pf.profileEmpty')}</p>
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
                    contentStyle={{ direction: dir, textAlign: lang === 'he' ? 'right' : 'left' }}
                    formatter={(v) => [`${v}/100`, t('pf.level')]}
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
                    <span className="pf-domain-name">{domainLabel(id)}</span>
                    <span className="pf-domain-bar">
                      <span
                        className={`pf-domain-fill score-${scoreClass(d ? level : null)}`}
                        style={{ width: `${level}%` }}
                      />
                    </span>
                    <span className="pf-domain-level">{d ? level : '—'}</span>
                    <span className={`pf-domain-trend ${arrow.cls}`} title={t('pf.trendTitle')}>
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
      {plan && plan.items.length > 0 && (
        <section className="pf-card">
          <div className="pf-plan-head">
            <h2 className="pf-card-title">{t('pf.plan')}</h2>
            <span className="pf-plan-total">
              {plan.weeklySessions} {t('pf.planPerWeek')}
              {focusDomain ? ` · ${t('pf.planFocus')}: ${focusDomain}` : ''}
            </span>
          </div>
          <p className="pf-card-subtitle">{t('pf.planSub')}</p>
          <ul className="pf-plan-list">
            {plan.items.map((it) => (
              <li className={`pf-plan-row prio-${it.priority}`} key={it.domainId}>
                <span className={`pf-plan-badge prio-${it.priority}`}>
                  {lang === 'he' ? it.priorityHe : priorityLabel(it.priority)}
                </span>
                <div className="pf-plan-main">
                  <div className="pf-plan-title">
                    <span className="pf-plan-domain">{domainLabel(it.domainId)}</span>
                    <span className="pf-plan-game">→ {gameLabel(it.gameId)}</span>
                  </div>
                  <p className="pf-plan-reason">
                    {lang === 'he'
                      ? it.reasonHe
                      : tdg(reasonKey(it), domainLabel(it.domainId), gameLabel(it.gameId))}
                  </p>
                </div>
                <span className="pf-plan-freq">
                  <span className="pf-plan-freq-num">{it.sessionsPerWeek}×</span>
                  <span className="pf-plan-freq-label">{t('pf.planWeekly')}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Cognitive-score trend (recent sessions) ── */}
      {trendData.length > 0 && (
        <section className="pf-card">
          <h2 className="pf-card-title">{t('pf.scoreTrend')}</h2>
          <p className="pf-card-subtitle">{t('pf.scoreTrendSub')}</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData} margin={{ top: 8, right: 18, left: -6, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} reversed={lang === 'he'} />
              <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fontSize: 12 }} />
              <ReferenceLine y={40} stroke="#fbbf24" strokeDasharray="4 4" />
              <ReferenceLine y={70} stroke="#16a34a" strokeDasharray="4 4" />
              <Tooltip
                contentStyle={{ direction: dir, textAlign: lang === 'he' ? 'right' : 'left' }}
                formatter={(v) => [v === null || v === undefined ? '—' : `${v}/100`, t('common.score')]}
              />
              <Line type="monotone" dataKey="score" stroke="#2f86d6" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* ── Open alerts ── */}
      {data.alerts.length > 0 && (
        <section className="pf-card">
          <h2 className="pf-card-title">{t('pf.openAlerts')}</h2>
          <ul className="pf-alert-list">
            {data.alerts.map((a, i) => (
              <li className="pf-alert-row" key={a.alertId ?? i}>
                <span className="pf-alert-dot" aria-hidden>●</span>
                <span className="pf-alert-game">{gameLabel(a.gameId)}</span>
                <span className="pf-alert-text">
                  {a.trigger === 'accuracy'
                    ? `${t('pf.alertAccuracy')}: ${a.accuracyDrop ?? '?'} ${t('pf.alertPoints')}`
                    : a.trigger === 'cognitive_score'
                    ? t('pf.alertScore')
                    : t('pf.alertPattern')}
                </span>
                <span className="pf-alert-date">{formatDate(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Session history (click → report drawer) ── */}
      <section className="pf-card">
        <h2 className="pf-card-title">{t('pf.history')}</h2>
        {data.sessions.length === 0 ? (
          <p className="pf-muted">{t('pf.historyEmpty')}</p>
        ) : (
          <div className="pf-session-list">
            {data.sessions.map((s) => (
              <button
                className="pf-session-card"
                key={s.sessionId}
                onClick={() => openReport(s.sessionId)}
                aria-label={`${t('pf.openReport')}${gameLabel(s.gameId)}`}
              >
                <div className="pf-session-meta">
                  <span className="pf-session-game">{gameLabel(s.gameId)}</span>
                  <span className="pf-session-date">{formatDate(s.generatedAt)}</span>
                  <span className="pf-session-acc">
                    {t('common.accuracy')}: {s.accuracy === null ? '—' : `${Math.round(s.accuracy * 100)}%`}
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
          <aside className="pf-drawer" dir={dir} onClick={(e) => e.stopPropagation()}>
            <div className="pf-drawer-head">
              <h2>{t('pf.reportTitle')}</h2>
              <button className="pf-drawer-close" onClick={closeReport} aria-label={t('pf.close')}>
                <X size={18} />
              </button>
            </div>

            {reportLoading && <p className="pf-muted">{t('pf.reportLoading')}</p>}
            {reportError && <p className="pf-error-text">{reportError}</p>}

            {report && (
              <div className="pf-report">
                <div className="pf-report-top">
                  <span className="pf-report-game">{gameLabel(report.gameId)}</span>
                  <span className={`pf-session-score score-${scoreClass(report.cognitiveScore)}`}>
                    {report.cognitiveScore ?? '—'}/100
                  </span>
                </div>
                <p className="pf-report-date">{formatDate(report.generatedAt)}</p>

                {report.summaryHe && <p className="pf-report-summary">{report.summaryHe}</p>}

                {report.domainScores && Object.keys(report.domainScores).length > 0 && (
                  <>
                    <h3 className="pf-report-h3">{t('pf.domainScores')}</h3>
                    <ul className="pf-report-domains">
                      {Object.entries(report.domainScores).map(([id, v]) => (
                        <li key={id}>
                          <span>{domainLabel(id)}</span>
                          <span className={`score-${scoreClass(v)}`}>{v}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {report.strengthsHe && report.strengthsHe.length > 0 && (
                  <>
                    <h3 className="pf-report-h3">{t('pf.strengths')}</h3>
                    <ul className="pf-report-bullets">
                      {report.strengthsHe.map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                  </>
                )}

                {report.recommendationsHe && report.recommendationsHe.length > 0 && (
                  <>
                    <h3 className="pf-report-h3">{t('pf.recommendations')}</h3>
                    <ul className="pf-report-bullets">
                      {report.recommendationsHe.map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                  </>
                )}

                {report.rawStats && (
                  <>
                    <h3 className="pf-report-h3">{t('pf.rawStats')}</h3>
                    <div className="pf-report-stats">
                      <div><span>{t('common.accuracy')}</span><span>{report.rawStats.accuracy != null ? `${Math.round(report.rawStats.accuracy * 100)}%` : '—'}</span></div>
                      <div><span>{t('pf.reactionTime')}</span><span>{report.rawStats.avgReactionMs != null ? `${Math.round(report.rawStats.avgReactionMs)}ms` : '—'}</span></div>
                      <div><span>{t('pf.peakStreak')}</span><span>{report.rawStats.peakStreak ?? '—'}</span></div>
                      <div><span>{t('pf.duration')}</span><span>{report.rawStats.durationMs != null ? `${Math.round(report.rawStats.durationMs / 1000)}s` : '—'}</span></div>
                      <div><span>{t('pf.adjustments')}</span><span>{report.rawStats.adjustmentCount ?? 0}</span></div>
                      <div><span>{t('pf.difficultyTrend')}</span><span>{report.rawStats.netDirection ? netDirLabel(report.rawStats.netDirection) : '—'}</span></div>
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
