import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAdminT, type AdminGameId } from '../adminI18n';
import './CoachReportsPage.css';

// ─── Types ────────────────────────────────────────────────────────

type GameId = AdminGameId;
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

const PROGRESS_ICONS: Record<Progress, string> = {
  improving:        '✓',
  stable:           '=',
  needs_attention:  '⚠',
};

// ─── Component ────────────────────────────────────────────────────

export default function CoachReportsPage() {
  const { userId } = useParams<{ userId: string }>();
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { t, tn, lang, dir, locale, gameLabel, progressLabel } = useAdminT();

  const formatDate = useCallback((ts: number | null): string => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString(locale, {
      day: 'numeric', month: 'numeric', year: 'numeric',
    });
  }, [locale]);

  // Reports carry both *He and *En variants — show the reader's language and
  // fall back to the other so a report generated before a language was added
  // still renders.
  const pick = useCallback(
    <T,>(heVal: T | undefined, enVal: T | undefined): T | undefined =>
      lang === 'he' ? (heVal ?? enVal) : (enVal ?? heVal),
    [lang],
  );

  const [reports,  setReports]  = useState<CoachReport[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [game,     setGame]     = useState<GameId | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchReports = async () => {
    if (!userId || !token || !isAdmin) return;
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
      setError(err instanceof Error ? err.message : t('common.loadError'));
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

  // ── Auth gate (admin-only) ────────────────────────────────────
  // Must sit below every hook: bailing out earlier would render a different
  // number of hooks if `isAdmin` ever flips, which React treats as an error.
  if (!isAdmin) return <Navigate to="/" />;

  // ── Render ────────────────────────────────────────────────────
  const Header = (
    <div className="cr-header">
      <div>
        <h1>{t('cr.title')}</h1>
        <p className="subtitle">{userId}</p>
      </div>
      <button className="cr-back-btn" onClick={() => navigate(-1)}>
        <ChevronRight size={14} />
        {t('common.back')}
      </button>
    </div>
  );

  if (loading) {
    return (
      <main className="coach-reports-page" dir={dir}>
        {Header}
        <div className="loading-state"><p>{t('cr.loading')}</p></div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="coach-reports-page" dir={dir}>
        {Header}
        <div className="error-state">
          <span className="emoji">⚠️</span>
          <h2>{t('cr.loadError')}</h2>
          <p>{error}</p>
          <button className="retry-btn" onClick={fetchReports}>{t('common.retry')}</button>
        </div>
      </main>
    );
  }

  if (reports.length === 0) {
    return (
      <main className="coach-reports-page" dir={dir}>
        {Header}
        <div className="empty-state">
          <span className="emoji">📋</span>
          <h2>{t('cr.emptyTitle')}</h2>
          <p>{t('cr.emptyBody')}</p>
        </div>
      </main>
    );
  }

  // ── Game tabs (only when multiple games or filter is active) ──
  const showTabs = availableGames.length > 1 || game !== 'all';

  return (
    <main className="coach-reports-page" dir={dir}>
      {Header}

      {showTabs && (
        <div className="cr-game-tabs" role="group" aria-label={t('cr.filterByGame')}>
          <button
            type="button"
            className={`cr-game-tab${game === 'all' ? ' active' : ''}`}
            aria-pressed={game === 'all'}
            onClick={() => setGame('all')}
          >
            {t('common.all')}
          </button>
          {availableGames.map(g => (
            <button
              key={g}
              type="button"
              className={`cr-game-tab${game === g ? ' active' : ''}`}
              aria-pressed={game === g}
              onClick={() => setGame(g)}
            >
              {gameLabel(g)}
            </button>
          ))}
        </div>
      )}

      <div className="cr-list">
        {reports.map(r => {
          const id           = r.id ?? `${r.gameId}-${r.generatedAt}`;
          const isOpen       = expanded.has(id);
          const summary      = pick(r.summaryHe,         r.summaryEn);
          const highlights   = pick(r.highlightsHe,      r.highlightsEn) ?? [];
          const recs         = pick(r.recommendationsHe, r.recommendationsEn) ?? [];
          const insight      = pick(r.cognitiveInsightHe, r.cognitiveInsightEn);

          return (
            <div className="cr-card" key={id}>
              <div className="cr-card-head">
                <div className="cr-card-meta">
                  <span className="cr-card-game">{gameLabel(r.gameId)}</span>
                  <span>{formatDate(r.generatedAt)}</span>
                </div>
                <span className={`cr-progress-badge ${r.overallProgress}`}>
                  <span aria-hidden>{PROGRESS_ICONS[r.overallProgress]}</span>
                  {progressLabel(r.overallProgress)}
                </span>
              </div>

              {summary && <p className="cr-summary">{summary}</p>}

              <button
                className="cr-toggle"
                onClick={() => toggle(id)}
                aria-expanded={isOpen}
              >
                {isOpen ? t('cr.hideDetails') : t('cr.showDetails')}
              </button>

              {isOpen && (
                <div className="cr-details">
                  {highlights.length > 0 && (
                    <div className="cr-section">
                      <h3>{t('cr.highlights')}</h3>
                      <ul>{highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
                    </div>
                  )}
                  {recs.length > 0 && (
                    <div className="cr-section">
                      <h3>{t('cr.recommendations')}</h3>
                      <ul>{recs.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                  )}
                  {insight && (
                    <div className="cr-section">
                      <h3>{t('cr.insight')}</h3>
                      <p>{insight}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="cr-card-footer">
                {tn('cr.basedOn', r.sessionCount)}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
