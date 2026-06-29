import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertCircle, ArrowLeft, BarChart3, Brain, CheckCircle2, Dumbbell, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang, type TKey } from '../../context/LanguageContext';
import { COGNITIVE_PROBLEMS, type ProblemId } from '../../data/cognitiveProblems';
import {
  getMyProfile,
  getMyProgression,
  isApiError,
  type DomainProfile,
  type ProgressionResponse,
} from '../../api/me';
import './ProgressPage.css';

type LoadState = 'loading' | 'ready' | 'error';

type DomainRow = {
  id: ProblemId;
  icon: string;
  color: string;
  gradient: string;
  title: string;
  level: number;
  confidence: number;
  sessionsCount: number;
  trend: DomainProfile['trend'];
};

const copy = {
  he: {
    title: 'התקדמות כללית',
    subtitle: 'מבט מרוכז על הרמה הכללית, התחומים החזקים והתחומים שכדאי לחזק באימונים הקרובים.',
    loading: 'טוען את ההתקדמות שלך...',
    error: 'לא הצלחנו לטעון את ההתקדמות הכללית',
    retry: 'נסה שוב',
    overall: 'רמה כללית',
    rank: 'דרגה',
    sessions: 'אימונים שבוצעו',
    avgLevel: 'ממוצע תחומים',
    strongest: 'התחום החזק ביותר',
    focus: 'תחום לשיפור',
    improving: 'תחומים במגמת עליה',
    declining: 'דורשים תשומת לב',
    summaryTitle: 'סיכום מצב',
    domainsTitle: 'פירוט לפי תחום',
    confidence: 'רמת ודאות',
    noSessions: 'עדיין אין אימונים',
    sessionOne: 'אימון אחד',
    sessionsMany: 'אימונים',
    journey: 'עבור למסע שלי',
    games: 'בחר אימון',
    recommendationTitle: 'המלצה לאימון הבא',
    recommendation: 'כדאי להתמקד בתחום החלש ביותר כרגע, ולבצע אימון קצר נוסף כדי לשפר יציבות ודיוק.',
    trend: 'מגמה',
  },
  en: {
    title: 'General Progress',
    subtitle: 'A focused view of your overall level, strongest skills, and areas worth training next.',
    loading: 'Loading your progress...',
    error: "Couldn't load your general progress",
    retry: 'Try again',
    overall: 'Overall level',
    rank: 'Rank',
    sessions: 'Completed sessions',
    avgLevel: 'Domain average',
    strongest: 'Strongest domain',
    focus: 'Focus area',
    improving: 'Improving domains',
    declining: 'Need attention',
    summaryTitle: 'Status summary',
    domainsTitle: 'Domain breakdown',
    confidence: 'Confidence',
    noSessions: 'No sessions yet',
    sessionOne: '1 session',
    sessionsMany: 'sessions',
    journey: 'Open My Journey',
    games: 'Choose training',
    recommendationTitle: 'Next training recommendation',
    recommendation: 'Focus on the currently weakest domain and complete another short session to improve consistency and accuracy.',
    trend: 'Trend',
  },
} as const;

function clampLevel(value: number | undefined): number {
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function trendIcon(trend: DomainProfile['trend']) {
  if (trend === 'up') return <TrendingUp size={18} />;
  if (trend === 'down') return <TrendingDown size={18} />;
  return <Activity size={18} />;
}

function confidencePercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

export default function ProgressPage() {
  const { token } = useAuth();
  const { t, lang, dir } = useLang();
  const c = copy[lang];

  const [status, setStatus] = useState<LoadState>('loading');
  const [progression, setProgression] = useState<ProgressionResponse | null>(null);
  const [profiles, setProfiles] = useState<Record<string, DomainProfile>>({});

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setStatus('loading');

    Promise.all([getMyProgression(token), getMyProfile(token)]).then(([progressionResult, profileResult]) => {
      if (cancelled) return;

      if (isApiError(progressionResult) || isApiError(profileResult)) {
        setStatus('error');
        return;
      }

      const nextProfiles: Record<string, DomainProfile> = {};
      profileResult.domains.forEach((domain) => {
        nextProfiles[domain.id] = domain;
      });

      setProgression(progressionResult);
      setProfiles(nextProfiles);
      setStatus('ready');
    }).catch(() => {
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const rows = useMemo<DomainRow[]>(() => {
    return COGNITIVE_PROBLEMS.map((problem) => {
      const profile = profiles[problem.id];
      return {
        id: problem.id,
        icon: problem.icon,
        color: problem.color,
        gradient: problem.gradient,
        title: t(`problem.${problem.id}.title` as TKey),
        level: clampLevel(profile?.level),
        confidence: profile?.confidence ?? 0,
        sessionsCount: profile?.sessionsCount ?? 0,
        trend: profile?.trend ?? 'stable',
      };
    });
  }, [profiles, t]);

  const stats = useMemo(() => {
    const sortedByLevel = [...rows].sort((a, b) => b.level - a.level);
    const strongest = sortedByLevel[0];
    const weakest = [...rows].sort((a, b) => a.level - b.level)[0];
    const totalSessions = rows.reduce((sum, row) => sum + row.sessionsCount, 0);
    const averageLevel = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.level, 0) / rows.length) : 0;
    const improving = rows.filter((row) => row.trend === 'up').length;
    const declining = rows.filter((row) => row.trend === 'down').length;

    return { strongest, weakest, totalSessions, averageLevel, improving, declining };
  }, [rows]);

  if (status === 'loading') {
    return (
      <main className="progress-page progress-centered" dir={dir}>
        <span className="progress-spinner" />
        <p>{c.loading}</p>
      </main>
    );
  }

  if (status === 'error' || !progression) {
    return (
      <main className="progress-page progress-centered" dir={dir}>
        <AlertCircle size={42} />
        <p>{c.error}</p>
        <button type="button" className="progress-primary" onClick={() => window.location.reload()}>
          {c.retry}
        </button>
      </main>
    );
  }

  return (
    <main className="progress-page" dir={dir}>
      <section className="progress-header">
        <div>
          <p className="progress-eyebrow"><BarChart3 size={18} /> {c.overall}</p>
          <h1>{c.title}</h1>
          <p>{c.subtitle}</p>
        </div>
        <div className="progress-level-ring" aria-label={`${c.overall} ${progression.overallLevel}`}>
          <span>{progression.overallLevel}</span>
          <small>/100</small>
        </div>
      </section>

      <section className="progress-kpis" aria-label={c.summaryTitle}>
        <article className="progress-kpi">
          <Brain size={22} />
          <span>{c.rank}</span>
          <strong>{t(`rank.${progression.rank}` as TKey)}</strong>
        </article>
        <article className="progress-kpi">
          <CheckCircle2 size={22} />
          <span>{c.sessions}</span>
          <strong>{stats.totalSessions}</strong>
        </article>
        <article className="progress-kpi">
          <Target size={22} />
          <span>{c.avgLevel}</span>
          <strong>{stats.averageLevel}</strong>
        </article>
        <article className="progress-kpi">
          <TrendingUp size={22} />
          <span>{c.improving}</span>
          <strong>{stats.improving}</strong>
        </article>
      </section>

      <section className="progress-summary-grid">
        <article className="progress-summary-card" style={{ '--progress-accent': stats.strongest?.color } as React.CSSProperties}>
          <span className="progress-summary-icon">{stats.strongest?.icon}</span>
          <div>
            <p>{c.strongest}</p>
            <h2>{stats.strongest?.title}</h2>
            <strong>{stats.strongest?.level ?? 0}</strong>
          </div>
        </article>
        <article className="progress-summary-card" style={{ '--progress-accent': stats.weakest?.color } as React.CSSProperties}>
          <span className="progress-summary-icon">{stats.weakest?.icon}</span>
          <div>
            <p>{c.focus}</p>
            <h2>{stats.weakest?.title}</h2>
            <strong>{stats.weakest?.level ?? 0}</strong>
          </div>
        </article>
        <article className="progress-recommendation">
          <Dumbbell size={24} />
          <div>
            <h2>{c.recommendationTitle}</h2>
            <p>{c.recommendation}</p>
          </div>
        </article>
      </section>

      <section className="progress-actions" aria-label="progress actions">
        <Link to="/journey" className="progress-primary">
          {c.journey}
          <ArrowLeft size={18} />
        </Link>
        <Link to="/games" className="progress-secondary">
          {c.games}
        </Link>
      </section>

      <section className="progress-domains" aria-label={c.domainsTitle}>
        <div className="progress-section-title">
          <h2>{c.domainsTitle}</h2>
          <span>{c.declining}: {stats.declining}</span>
        </div>

        <div className="progress-domain-grid">
          {rows.map((row) => {
            const sessionsText = row.sessionsCount === 0
              ? c.noSessions
              : row.sessionsCount === 1
                ? c.sessionOne
                : `${row.sessionsCount} ${c.sessionsMany}`;
            const confidence = confidencePercent(row.confidence);

            return (
              <article
                key={row.id}
                className="progress-domain-card"
                style={{ '--progress-accent': row.color, '--progress-gradient': row.gradient } as React.CSSProperties}
              >
                <div className="progress-domain-top">
                  <span className="progress-domain-icon">{row.icon}</span>
                  <div>
                    <h3>{row.title}</h3>
                    <p>{sessionsText}</p>
                  </div>
                </div>

                <div className="progress-meter-block">
                  <div className="progress-meter-label">
                    <span>{c.overall}</span>
                    <strong>{row.level}</strong>
                  </div>
                  <div className="progress-meter" aria-hidden="true">
                    <span style={{ width: `${row.level}%` }} />
                  </div>
                </div>

                <div className="progress-domain-meta">
                  <span>{trendIcon(row.trend)} {c.trend}: {t(`trend.${row.trend}` as TKey)}</span>
                  <span>{c.confidence}: {confidence}%</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
