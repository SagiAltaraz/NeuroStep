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
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLang, type TKey } from '../../context/LanguageContext';
import Avatar from '../journey/Avatar';
import type { SessionResult } from '../../hooks/useGameSession';

interface Props {
  result:   SessionResult;
  onFinish: () => void;
}

// Slightly longer than the hook's REPORT_TIMEOUT_MS (12s) so we only show the
// "couldn't load" fallback after the hook itself has given up waiting.
const RESULT_FALLBACK_MS = 13_000;

const fmtPct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export default function SessionResults({ result, onFinish }: Props) {
  const { t } = useLang();
  const navigate = useNavigate();

  const [finishing, setFinishing] = useState(false);
  const [timedOut, setTimedOut]   = useState(false);

  // Fallback: if the user finished but no summary/report ever arrives (trivial
  // sub-5-event session, or a stalled pipeline), stop spinning.
  useEffect(() => {
    if (!finishing || result.phase !== 'none') return;
    const id = setTimeout(() => setTimedOut(true), RESULT_FALLBACK_MS);
    return () => clearTimeout(id);
  }, [finishing, result.phase]);

  const ended = finishing || result.phase !== 'none';

  if (!ended) {
    return (
      <button
        type="button"
        onClick={() => { setFinishing(true); onFinish(); }}
        className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-indigo-600 px-8 py-3
                   text-base font-semibold text-white shadow-xl ring-1 ring-black/5 transition-transform
                   hover:scale-105 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4
                   focus-visible:ring-indigo-300"
      >
        {t('results.finish')}
      </button>
    );
  }

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
            className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl"
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

                <h2 className="text-center text-2xl font-bold text-slate-900">{t('results.title')}</h2>

                {/* Cognitive score ring (report only) */}
                {phase === 'report' && report && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full
                                    bg-indigo-50 text-3xl font-extrabold text-indigo-600 ring-4 ring-indigo-100">
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
      className={`inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3
                  text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700
                  focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 ${className}`}
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
  // A level-up is always a 'climb' or 'celebrate' cue; default to 'celebrate'.
  const avatarState = result.avatarState === 'climb' ? 'climb' : 'celebrate';
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-b from-amber-100 to-amber-50
                 p-4 pt-6 text-center text-amber-900 ring-1 ring-amber-200"
    >
      <Avatar state={avatarState} size={64} />
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
