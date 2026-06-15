/**
 * JourneyPage (/journey) — the Candy-Crush-style progression map.
 *
 * A top-to-bottom path of 8 region nodes (one per cognitive domain). Each region
 * shows its journey node (1..10) from the progression engine, the domain's
 * recent trend, and a button to train it (→ the domain's primary game). A hero
 * Avatar reflects the latest avatarState (idle/climb/drop/celebrate) and the
 * "you are here" marker sits on the furthest region reached.
 *
 * Data: GET /api/me/progression (nodes/rank) + /api/me/profile (per-domain trend).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useLang, type TKey } from '../../context/LanguageContext';
import { COGNITIVE_PROBLEMS, gamesForProblem, type ProblemId } from '../../data/cognitiveProblems';
import {
  getMyProgression, getMyProfile, isApiError,
  type ProgressionResponse, type DomainProfile, type Trend,
} from '../../api/me';
import Avatar from '../../components/journey/Avatar';

const TOTAL_NODES = 10;

const TREND_STYLE: Record<Trend, { icon: string; cls: string }> = {
  up:     { icon: '▲', cls: 'bg-emerald-50 text-emerald-700' },
  stable: { icon: '＝', cls: 'bg-slate-100 text-slate-600' },
  down:   { icon: '▼', cls: 'bg-rose-50 text-rose-700' },
};

export default function JourneyPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [prog, setProg]         = useState<ProgressionResponse | null>(null);
  const [profiles, setProfiles] = useState<Record<string, DomainProfile>>({});
  const [status, setStatus]     = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setStatus('loading');
    Promise.all([getMyProgression(token), getMyProfile(token)]).then(([p, pr]) => {
      if (cancelled) return;
      if (isApiError(p)) { setStatus('error'); return; }
      setProg(p);
      if (!isApiError(pr)) {
        const map: Record<string, DomainProfile> = {};
        pr.domains.forEach((d) => { map[d.id] = d; });
        setProfiles(map);
      }
      setStatus('ready');
    });
    return () => { cancelled = true; };
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-slate-500">{t('journey.loading')}</p>
      </div>
    );
  }

  if (status === 'error' || !prog) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
        <p className="text-lg font-medium text-slate-700">{t('journey.error')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700"
        >
          {t('journey.retry')}
        </button>
      </div>
    );
  }

  const regions = prog.regions ?? {};
  const nodeOf = (id: ProblemId) => regions[id]?.node ?? 1;

  // The "you are here" marker sits on the furthest region reached (highest node;
  // ties broken by domain order — the first in COGNITIVE_PROBLEMS).
  const furthest = COGNITIVE_PROBLEMS.reduce<ProblemId | null>((best, p) => {
    if (best === null || nodeOf(p.id) > nodeOf(best)) return p.id;
    return best;
  }, null);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8" dir="rtl">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <Avatar state={prog.avatarState} size={72} />
        <h1 className="text-3xl font-bold text-slate-900">{t('journey.title')}</h1>
        <p className="text-slate-500">{t('journey.subtitle')}</p>
        <div className="mt-2 flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-sm font-semibold text-indigo-700">
          <span>{t(`rank.${prog.rank}` as TKey)}</span>
          <span className="text-indigo-300">·</span>
          <span>{t('journey.overall')} {prog.overallLevel}</span>
        </div>
      </div>

      {/* ── Path of regions ───────────────────────────────────── */}
      <div className="flex flex-col">
        {COGNITIVE_PROBLEMS.map((problem, i) => {
          const node    = nodeOf(problem.id);
          const trend   = profiles[problem.id]?.trend;
          const isHere  = problem.id === furthest;
          const isLast  = i === COGNITIVE_PROBLEMS.length - 1;
          const best    = gamesForProblem(problem.id)[0];
          const route   = best ? `/games/${best.gameId}` : undefined;

          return (
            <motion.div
              key={problem.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative flex gap-4"
            >
              {/* Spine: domain medallion + connector line */}
              <div className="flex flex-col items-center">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl shadow-md ring-4 ring-white"
                  style={{ background: problem.gradient }}
                >
                  {problem.icon}
                </div>
                {!isLast && <div className="my-1 w-1 flex-1 rounded bg-slate-200" />}
              </div>

              {/* Region card */}
              <div className="mb-4 flex-1 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-bold text-slate-900">
                    {t(`problem.${problem.id}.title` as TKey)}
                  </h2>
                  {isHere && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {t('journey.you')}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <span>{t('journey.node')} {node} {t('journey.of')} {TOTAL_NODES}</span>
                  {trend && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TREND_STYLE[trend].cls}`}>
                      {TREND_STYLE[trend].icon} {t(`trend.${trend}` as TKey)}
                    </span>
                  )}
                </div>

                {/* Node track */}
                <div className="mt-3 flex gap-1.5">
                  {Array.from({ length: TOTAL_NODES }, (_, n) => {
                    const filled  = n < node;
                    const current = n === node - 1;
                    return (
                      <span
                        key={n}
                        className={`h-2.5 flex-1 rounded-full ${filled ? '' : 'bg-slate-200'} ${current ? 'ring-2 ring-offset-1' : ''}`}
                        style={filled ? { background: problem.color } : undefined}
                      />
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={!route}
                  onClick={() => route && navigate(route)}
                  className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: problem.color }}
                >
                  {t('journey.play')}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
