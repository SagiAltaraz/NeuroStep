/**
 * SessionResults — the end-of-session flow shared by every game.
 *
 * Most games are continuous loops with no natural "game over", so the user ends
 * a session explicitly: a floating "Finish" button calls `onFinish` (→ the
 * hook's endSession), then this overlay walks the SessionResult phases:
 *
 *   none (just finished) → spinner  →  summary (quick stats)  →  report (full)
 *
 * Mount it as a sibling of the game inside each game page; pass the hook's
 * `sessionResult` + `endSession`.
 *
 * NOTE: this project has no shadcn theme configured (tailwind.config `extend` is
 * empty), so semantic tokens like `bg-background`/`bg-primary` render colourless.
 * We use concrete palette colours (white / slate / indigo) for guaranteed contrast.
 */
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLang, type TKey } from '../../context/LanguageContext';
import { useCompanionPresentation } from '../../context/CompanionPresentationContext';
import AnimatedAvatar from '../companion/AnimatedAvatar';
import { emitCelebrate } from '../companion/celebrate';
import type { SessionResult } from '../../hooks/useGameSession';

interface Props {
  result:    SessionResult;
  /** The exit flow has started (e.g. the in-game back button) — show the
   *  spinner → summary → report flow. Sessions also finalize server-side on
   *  ANY disconnect, so progress never depends on this overlay being shown. */
  active?:   boolean;
  /** Deprecated — sessions end on exit/disconnect now; kept so existing game
   *  pages compile unchanged. */
  onFinish?: () => void;
}

// Slightly longer than the hook's REPORT_TIMEOUT_MS (12s) so we only show the
// "couldn't load" fallback after the hook itself has given up waiting.
const RESULT_FALLBACK_MS = 13_000;

const fmtPct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export default function SessionResults({ result, active = false }: Props) {
  const { t } = useLang();
  const navigate = useNavigate();
  const { showResultAvatar, hideResultAvatar } = useCompanionPresentation();

  const [timedOut, setTimedOut] = useState(false);
  const ended = active || result.phase !== 'none';

  useLayoutEffect(() => {
    if (!ended) return;
    showResultAvatar();
    return hideResultAvatar;
  }, [ended, showResultAvatar, hideResultAvatar]);

  // Fallback: if the exit flow started but no summary/report ever arrives
  // (trivial sub-5-event session, or a stalled pipeline), stop spinning.
  useEffect(() => {
    if (!active || result.phase !== 'none') return;
    const id = setTimeout(() => setTimedOut(true), RESULT_FALLBACK_MS);
    return () => clearTimeout(id);
  }, [active, result.phase]);

  // When the full report lands with a node promotion, cue the companion mascot
  // to celebrate — fires once per report (levelChanges identity is stable).
  useEffect(() => {
    if (result.phase === 'report' && (result.levelChanges ?? []).some((c) => c.delta > 0)) {
      emitCelebrate();
    }
  }, [result.phase, result.levelChanges]);

  if (!ended) return null;

  const { phase, stats, report } = result;
  const leveledUp = (result.levelChanges ?? []).some((c) => c.delta > 0);

  return (
    <AnimatePresence>
      <motion.div
        key="session-results"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex min-h-full items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.94, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            className="ns-card-glass w-full max-w-md rounded-2xl p-6 text-slate-900 shadow-2xl"
          >
            {/* ── Loading / fallback ───────────────────────────────── */}
            {phase === 'none' && !timedOut && (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <span className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                <p className="text-lg font-medium text-slate-700">{t('results.summarizing')}</p>
              </div>
            )}

            {phase === 'none' && timedOut && (
              <div className="flex flex-col items-center gap-5 py-8 text-center">
                <p className="text-lg font-medium text-slate-700">{t('results.unavailable')}</p>
                <PrimaryButton onClick={() => navigate('/games')}>{t('results.back')}</PrimaryButton>
              </div>
            )}

            {/* ── Summary + Report ─────────────────────────────────── */}
            {phase !== 'none' && (
              <div className="flex flex-col gap-5">
                {/* Level-up moment (only when the journey map advanced) */}
                {phase === 'report' && leveledUp && <LevelUpBanner result={result} t={t} />}

                <h2 className="ns-display text-center text-2xl font-bold text-slate-900">{t('results.title')}</h2>

                {/* Cognitive score ring (report only) */}
                {phase === 'report' && report && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="ns-display flex h-24 w-24 items-center justify-center rounded-full
                                    bg-sky-50 text-3xl font-extrabold text-[#2f86d6] ring-4 ring-sky-100">
                      {report.cognitiveScore}
                    </div>
                    <span className="text-sm text-slate-500">{t('results.score')}</span>
                  </div>
                )}

                {/* Difficulty the session converged to (E2) */}
                {phase === 'report' && typeof report?.difficulty === 'number' && (
                  <p className="text-center text-sm text-slate-500">
                    {t('results.difficulty')}:{' '}
                    <strong className="text-slate-700">{Math.round(report.difficulty * 100)}%</strong>
                  </p>
                )}

                {/* Quick stats grid */}
                {stats && (
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label={t('results.accuracy')} value={fmtPct(stats.accuracy)} />
                    <Stat label={t('results.reaction')} value={`${Math.round(stats.avgReactionMs)} ${t('results.ms')}`} />
                    <Stat label={t('results.streak')}   value={String(stats.peakStreak)} />
                    <Stat label={t('results.duration')} value={`${stats.durationSec} ${t('results.sec')}`} />
                  </div>
                )}

                {/* Narrative + lists (report only) */}
                {phase === 'report' && report && (
                  <>
                    <p className="text-center text-sm leading-relaxed text-slate-600">{report.summaryHe}</p>
                    <List title={t('results.strengths')}       items={report.strengthsHe} />
                    <List title={t('results.recommendations')} items={report.recommendationsHe} />
                  </>
                )}

                {/* Report still computing */}
                {phase === 'summary' && (
                  <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                    {t('results.computing')}
                  </p>
                )}

                <PrimaryButton className="mt-2 w-full" onClick={() => navigate('/games')}>
                  {t('results.back')}
                </PrimaryButton>
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PrimaryButton({
  children, onClick, className = '',
}: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ns-btn-brand ns-display inline-flex items-center justify-center rounded-xl px-5 py-3
                  text-base font-semibold text-white shadow-sm transition-transform hover:scale-[1.02]
                  focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300 ${className}`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 p-3 text-center">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

function LevelUpBanner({ result, t }: { result: SessionResult; t: (k: TKey) => string }) {
  const promoted = (result.levelChanges ?? []).filter((c) => c.delta > 0);
  const avatarState = result.avatarState ?? 'celebrate';
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-b from-amber-100 to-amber-50
                 p-4 pt-6 text-center text-amber-900 ring-1 ring-amber-200"
    >
      <AnimatedAvatar mode={avatarState} size={96} />
      <div className="text-lg font-bold">{t('results.levelup')}</div>
      <div className="text-sm">
        {t('results.rank')}: <strong>{t(`rank.${result.rank}` as TKey)}</strong>
        {typeof result.overallLevel === 'number' && (
          <> · {t('results.level')} {result.overallLevel}</>
        )}
      </div>
      {promoted.length > 0 && (
        <div className="text-xs">
          {t('results.progressed')}{' '}
          {promoted.map((c) => t(`problem.${c.domainId}.title` as TKey)).join(' · ')}
        </div>
      )}
    </motion.div>
  );
}
