/**
 * JourneyPage (/journey) — Candy-Crush-style winding 1..100 path, per cognitive
 * ability. The step number IS the domain's cognitive level (cognitiveProfile.level,
 * 0..100); milestones every 10 align with the progression node/world. A walking
 * character stands on the current step; numbers show on the current/prev/next and
 * every 5th; the trail flows toward the next step. Pick an ability via the chips.
 *
 * Data: GET /api/me/profile (per-domain level + trend) + /api/me/progression (rank/overall).
 * Pure frontend — reads existing endpoints, touches nothing in the game/agent core.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLang, type TKey } from '../../context/LanguageContext';
import { COGNITIVE_PROBLEMS, gamesForProblem, type ProblemId } from '../../data/cognitiveProblems';
import {
  getMyProgression, getMyProfile, isApiError,
  type ProgressionResponse, type DomainProfile,
} from '../../api/me';
import Avatar from '../../components/journey/Avatar';
import './JourneyMap.css';

// ── path geometry ──────────────────────────────────────────────
const N = 100, W = 460, CX = W / 2, AMP = 120, SP = 92, PAD = 70;
const MAP_H = PAD * 2 + (N - 1) * SP;
const xy = (i: number) => ({ x: CX + AMP * Math.sin(i * 0.55), y: PAD + (N - i) * SP });

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function trendText(trend?: DomainProfile['trend']): string {
  if (trend === 'up') return 'מגמת שיפור';
  if (trend === 'down') return 'נדרשת תשומת לב';
  return 'מגמה יציבה';
}

function confidenceText(confidence?: number): string {
  if (typeof confidence !== 'number') return 'רמת ודאות נמוכה - כדאי להשלים עוד אימונים.';
  if (confidence >= 0.7) return 'רמת ודאות טובה על בסיס האימונים האחרונים.';
  if (confidence >= 0.4) return 'רמת ודאות בינונית - עוד כמה אימונים יחדדו את התמונה.';
  return 'רמת ודאות נמוכה - כדאי לצבור עוד נתוני אימון.';
}

function improvementText(level: number, trend?: DomainProfile['trend']): string {
  if (level < 35) return 'כדאי להתחיל באימון קצר ורגוע, להתמקד בדיוק לפני מהירות, ולחזור על התחום כמה פעמים השבוע.';
  if (level < 65) return 'כדאי לשפר עקביות: לשמור על קצב נוח, להקטין טעויות, ולנסות להעלות רצף הצלחות.';
  if (trend === 'down') return 'היכולת גבוהה, אבל יש ירידה זמנית. כדאי לבצע אימון קל יותר ולבדוק אם העייפות משפיעה.';
  return 'המצב טוב. כדאי לאתגר בהדרגה עם רמות קושי גבוהות יותר ולשמור על יציבות לאורך זמן.';
}
export default function JourneyPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [prog, setProg]         = useState<ProgressionResponse | null>(null);
  const [profiles, setProfiles] = useState<Record<string, DomainProfile>>({});
  const [status, setStatus]     = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<ProblemId | null>(null);
  const [assistantStatus, setAssistantStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const charRef = useRef<HTMLDivElement>(null);

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

  const levelOf = (id: ProblemId) => Math.round(profiles[id]?.level ?? 0);

  // default the selected ability to the one the player has progressed furthest in
  useEffect(() => {
    if (status !== 'ready' || selected) return;
    const furthest = COGNITIVE_PROBLEMS.reduce((best, p) =>
      levelOf(p.id) > levelOf(best.id) ? p : best, COGNITIVE_PROBLEMS[0]);
    setSelected(furthest.id);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // scroll the character into view when the ability/level changes
  useEffect(() => {
    if (status !== 'ready') return;
    const id = setTimeout(() => charRef.current?.scrollIntoView({ block: 'center' }), 40);
    return () => clearTimeout(id);
  }, [selected, status]);
  useEffect(() => {
    if (!token || status !== 'ready') return;

    let cancelled = false;
    setAssistantStatus('loading');

    fetch('/api/askAI', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        intent: 'progression',
        prompt: 'תן הסבר קצר על מצב המסע הנוכחי שלי.',
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.response || 'Assistant request failed');
        return data?.response as string | undefined;
      })
      .then((response) => {
        if (cancelled) return;
        setAssistantStatus(response ? 'ready' : 'error');
      })
      .catch(() => {
        if (cancelled) return;
        setAssistantStatus('error');
      });

    return () => { cancelled = true; };
  }, [token, status]);

  const problem = useMemo(
    () => COGNITIVE_PROBLEMS.find((p) => p.id === selected) ?? COGNITIVE_PROBLEMS[0],
    [selected],
  );
  const selectedProfile = profiles[problem.id];
  const selectedLevel = Math.min(N, Math.max(1, levelOf(problem.id)));
  const selectedTrend = selectedProfile?.trend ?? 'stable';

  const topicSummary = [
    `רמה נוכחית: ${selectedLevel} מתוך ${N}`,
    `${trendText(selectedTrend)}. ${confidenceText(selectedProfile?.confidence)}`,
    `מה כדאי לשפר: ${improvementText(selectedLevel, selectedTrend)}`,
  ].join('\n');
  const assistantUserName = user?.name?.trim() || 'משתמש';

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

  const color = problem.color;
  const cur = selectedLevel;
  const trailD = (() => {
    let d = 'M';
    for (let i = N; i >= 1; i--) { const p = xy(i); d += ` ${p.x.toFixed(1)} ${p.y.toFixed(1)}${i > 1 ? ' L' : ''}`; }
    return d;
  })();

  const primaryGame = gamesForProblem(problem.id)[0];
  const mapStyle = {
    height: MAP_H,
    ['--jm-accent' as string]: color,
    ['--jm-accent-a' as string]: hexA(color, 0.18),
  } as React.CSSProperties;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-6" dir="rtl">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-col items-center gap-1 text-center">
        <Avatar state={prog.avatarState} size={56} />
        <h1 className="text-2xl font-bold text-slate-900">{t('journey.title')}</h1>
        <div className="mt-1 flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-sm font-semibold text-indigo-700">
          <span>{t(`rank.${prog.rank}` as TKey)}</span>
          <span className="text-indigo-300">ֲ·</span>
          <span>{t('journey.overall')} {prog.overallLevel}</span>
        </div>
      </div>

      <div className="jm-ai-dock">
        {isAssistantOpen && (
          <button
            type="button"
            className="jm-ai-scrim"
            aria-label="סגור הסבר"
            onClick={() => setIsAssistantOpen(false)}
          />
        )}
        {!isAssistantOpen && (
          <button
            type="button"
            className="jm-ai-avatar-button"
            aria-label="פתח הסבר"
            aria-expanded={isAssistantOpen}
            onClick={() => setIsAssistantOpen(true)}
          >
            <span className="jm-ai-avatar" aria-hidden="true">
              <span className="jm-ai-avatar-ring" />
              <span className="jm-ai-avatar-face">
                <span className="jm-ai-avatar-antenna" />
                <span className="jm-ai-avatar-eye left" />
                <span className="jm-ai-avatar-eye right" />
                <span className="jm-ai-avatar-smile" />
              </span>
              <span className="jm-ai-avatar-spark one" />
              <span className="jm-ai-avatar-spark two" />
            </span>
            <span className="jm-ai-button-text">שלום {assistantUserName}<br /><strong>לחץ עליי להוראות</strong></span>
          </button>
        )}
        {isAssistantOpen && (
          <section className="jm-ai-summary" aria-live="polite" dir="rtl">
            <div className="jm-ai-copy" dir="rtl">
              <div className="jm-ai-title">העוזר האישי - {t(`problem.${problem.id}.title` as TKey)}</div>
              <p>{topicSummary}</p>
              {assistantStatus === 'loading' && (
                <div className="jm-ai-loading jm-ai-loading-compact">
                  <span className="jm-ai-spinner" />
                  <span>מסנכרן עם העוזר האישי...</span>
                </div>
              )}
              {assistantStatus === 'error' && (
                <div className="jm-ai-note">ההסבר מוצג לפי נתוני המסע המקומיים כרגע.</div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* ── Ability chips — sticky, so you can switch abilities while
             scrolling the long path without jumping back to the top ───── */}
      <div className="jm-chipbar">
        <div className="jm-chips">
        {COGNITIVE_PROBLEMS.map((p) => {
          const on = p.id === problem.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`jm-chip ${on ? 'jm-on' : ''}`}
              style={on ? { background: p.color } : undefined}
              onClick={() => setSelected(p.id)}
            >
              <span className="jm-dot" style={{ background: p.color }} />
              {t(`problem.${p.id}.title` as TKey)}
            </button>
          );
        })}
        </div>
      </div>

      {/* ── Ability header ────────────────────────────────────── */}
      <div className="mb-3 text-center">
        <div className="text-lg font-bold text-slate-900">{t(`problem.${problem.id}.title` as TKey)}</div>
        <div className="text-sm font-semibold text-slate-500">
          {t('journey.node')} {cur} {t('journey.of')} {N}
        </div>
      </div>

      {/* ── Winding 1..100 path ───────────────────────────────── */}
      <div className="jm-wrap">
        <div className="jm-map" style={mapStyle}>
          <svg className="jm-trail" viewBox={`0 0 ${W} ${MAP_H}`} preserveAspectRatio="none">
            <path d={trailD} fill="none" stroke="#ffffff" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
            <path d={trailD} className="jm-flow" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
          </svg>

          {Array.from({ length: N }, (_, idx) => {
            const i = idx + 1;
            const p = xy(i);
            const mile = i % 10 === 0;
            const isCur = i === cur, isPrev = i === cur - 1, isNext = i === cur + 1;
            const done = i < cur;
            const showNum = i % 5 === 0 || isCur || isPrev || isNext;
            const size = mile ? 46 : 34;
            const cls = [
              'jm-node',
              done ? 'jm-done' : 'jm-locked',
              isNext ? 'jm-next' : '',
              mile ? 'jm-mile' : '',
              showNum ? 'jm-num' : '',
            ].join(' ');
            const label = showNum ? String(i) : done ? '✓' : '🔒';
            return (
              <div
                key={i}
                className={cls}
                style={{
                  left: p.x, top: p.y,
                  width: size, height: size,
                  fontSize: mile ? 15 : 13,
                  opacity: isCur ? 0 : 1,            // current is hidden — the character stands here
                  background: done ? color : undefined,
                }}
              >
                {label}
                {mile && <span className="jm-mbadge">★</span>}
              </div>
            );
          })}

          {/* walking character on the current step */}
          <div ref={charRef} className="jm-char" style={{ left: xy(cur).x, top: xy(cur).y }}>
            <svg viewBox="0 0 46 54" width="46" height="54">
              <ellipse cx="23" cy="52" rx="11" ry="3" fill="rgba(28,58,69,.18)" />
              <g className="jm-arm-b"><rect x="11" y="22" width="5" height="15" rx="2.5" fill={color} /></g>
              <g className="jm-leg-b"><rect x="19" y="36" width="6" height="15" rx="3" fill="#1c3a45" /></g>
              <g className="jm-leg-a"><rect x="23" y="36" width="6" height="15" rx="3" fill="#244a59" /></g>
              <rect x="14" y="20" width="18" height="20" rx="9" fill={color} />
              <g className="jm-arm-a"><rect x="30" y="22" width="5" height="15" rx="2.5" fill={color} /></g>
              <circle cx="23" cy="13" r="9" fill="#fff" stroke={color} strokeWidth="2.5" />
              <circle cx="20" cy="13" r="1.6" fill="#1c3a45" />
              <circle cx="26" cy="13" r="1.6" fill="#1c3a45" />
              <path d="M20 16 q3 2.5 6 0" fill="none" stroke="#1c3a45" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <div className="jm-youtag">{t('journey.node')} {cur}</div>
          </div>
        </div>
      </div>

      {/* ── Train-this-ability CTA ────────────────────────────── */}
      {primaryGame && (
        <button
          type="button"
          onClick={() => navigate(`/games/${primaryGame.gameId}`)}
          className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-2xl px-6 py-3.5 font-bold text-white shadow-xl"
          style={{ background: 'var(--ns-grad-brand, linear-gradient(135deg,#1c3a45,#2f86d6))' }}
        >
          {t('journey.play')}
        </button>
      )}

      {/* Jump back to the top of the path */}
      <button
        type="button"
        aria-label="scroll to top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="jm-totop"
      >
        ↑
      </button>
    </div>
  );
}
