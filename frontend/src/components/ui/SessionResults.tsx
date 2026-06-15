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
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLang, type TKey } from '../../context/LanguageContext';
import { Button } from './button';
import { cn } from '../../lib/utils';
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
        className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-primary px-8 py-3
                   text-base font-semibold text-primary-foreground shadow-lg transition-transform
                   hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ scale: 0.92, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-background p-6 shadow-2xl"
        >
          {/* ── Loading / fallback ───────────────────────────────── */}
          {phase === 'none' && !timedOut && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              <p className="text-lg font-medium">{t('results.summarizing')}</p>
            </div>
          )}

          {phase === 'none' && timedOut && (
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <p className="text-lg font-medium">{t('results.unavailable')}</p>
              <Button onClick={() => navigate('/games')}>{t('results.back')}</Button>
            </div>
          )}

          {/* ── Summary + Report ─────────────────────────────────── */}
          {phase !== 'none' && (
            <div className="flex flex-col gap-5">
              {/* Level-up moment (only when the journey map advanced) */}
              {phase === 'report' && leveledUp && (
                <LevelUpBanner result={result} t={t} />
              )}

              <h2 className="text-center text-2xl font-bold">{t('results.title')}</h2>

              {/* Cognitive score ring (report only) */}
              {phase === 'report' && report && (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full
                                  bg-primary/10 text-3xl font-extrabold text-primary">
                    {report.cognitiveScore}
                  </div>
                  <span className="text-sm text-muted-foreground">{t('results.score')}</span>
                </div>
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
                  <p className="text-center text-sm leading-relaxed text-muted-foreground">
                    {report.summaryHe}
                  </p>
                  <List title={t('results.strengths')}       items={report.strengthsHe} />
                  <List title={t('results.recommendations')} items={report.recommendationsHe} />
                </>
              )}

              {/* Report still computing */}
              {phase === 'summary' && (
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  {t('results.computing')}
                </p>
              )}

              <Button className="mt-2 w-full" onClick={() => navigate('/games')}>
                {t('results.back')}
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

function LevelUpBanner({ result, t }: { result: SessionResult; t: (k: TKey) => string }) {
  const promoted = (result.levelChanges ?? []).filter((c) => c.delta > 0);
  // F3 will drop an animated <Avatar state={result.avatarState} /> in place of
  // the emoji below; avatarState ('climb' | 'celebrate') already drives the cue.
  const celebrate = result.avatarState === 'celebrate';
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl p-4 text-center',
        'bg-gradient-to-b from-amber-100 to-amber-50 text-amber-900',
      )}
    >
      <motion.span
        className="text-5xl"
        animate={celebrate ? { rotate: [0, -12, 12, 0], y: [0, -6, 0] } : { y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 1.4 }}
      >
        {celebrate ? '🎉' : '⬆️'}
      </motion.span>
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
