/**
 * CompanionAvatar — a friendly mascot that sits on the side of the screen and
 * pops a proactive, data-driven message: a greeting + a game suggestion derived
 * from the player's own cognitive profile (GET /api/me/companion).
 *
 * The character here is a placeholder SVG (to be replaced by the original
 * Higgsfield asset). Clicking the character toggles the bubble; the CTA opens
 * the suggested game. Resilient: if the API is unavailable it still greets.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyCompanion, isApiError, type CompanionResponse } from '../../api/me';
import './CompanionAvatar.css';

// companion's kebab gameId → the camelCase route path used in App.tsx
const GAME_ROUTE: Record<string, string> = {
  memory: 'memory',
  'find-letter': 'findLetter',
  'color-trains': 'colorTracking',
  'spot-difference': 'spotDifference',
  'green-light': 'greenLight',
  'shapes-click': 'shapesClick',
  tictactoe: 'ticTacToe',
  'where-was-it': 'whereWasIt',
};

const FALLBACK: CompanionResponse = {
  greetingHe: 'היי! כיף לראות אותך 👋',
  reasonHe: 'בא לך אימון קצר ונעים? בוא נתחיל 🙂',
  suggestedGameId: 'memory',
  suggestedGameHe: 'זיכרון',
  mood: 'welcome',
};

// Robot poses → image files in /public/companion/. Any missing pose gracefully
// falls back to idle; a missing idle falls back to the SVG placeholder.
type Pose = 'idle' | 'wave' | 'think' | 'celebrate';
const POSE_SRC: Record<Pose, string> = {
  idle: '/companion/neurostep-bot.png',
  wave: '/companion/neurostep-bot-wave.png',
  think: '/companion/neurostep-bot-think.png',
  celebrate: '/companion/neurostep-bot-celebrate.png',
};

export default function CompanionAvatar() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<CompanionResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [pose, setPose] = useState<Pose>('idle');
  // which pose images failed to load (missing files) → fall back to idle/SVG
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      let res: CompanionResponse = FALLBACK;
      if (token) {
        const r = await getMyCompanion(token);
        if (!isApiError(r)) res = r;
      }
      if (cancelled) return;
      setData(res);
      setOpen(true);
      // greet with a wave, then settle back to idle
      setPose('wave');
      setTimeout(() => { if (!cancelled) setPose('idle'); }, 2600);
    })();
    return () => { cancelled = true; };
  }, [token, user]);

  if (!user || !data) return null;

  // resolve the pose to show: a missing pose image degrades to idle
  const resolvedPose: Pose = broken[pose] ? 'idle' : pose;

  const goPlay = () => {
    setOpen(false);
    navigate(`/games/${GAME_ROUTE[data.suggestedGameId] ?? 'memory'}`);
  };

  return (
    <div className="companion" dir="rtl">
      {open && (
        <div className="companion-bubble" role="status">
          <button className="companion-close" onClick={() => setOpen(false)} aria-label="סגור">×</button>
          <p className="companion-greet">{data.greetingHe}</p>
          <p className="companion-reason">{data.reasonHe}</p>
          <button className="companion-cta" onClick={goPlay}>
            בוא נשחק ב{data.suggestedGameHe} ←
          </button>
        </div>
      )}

      <button
        className={`companion-char ${open ? 'is-talking' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="המאמן שלי"
        title="המאמן שלי"
      >
        {!broken.idle ? (
          <img
            key={resolvedPose}
            className="companion-img"
            src={POSE_SRC[resolvedPose]}
            alt="המאמן שלי"
            onError={() => setBroken((b) => ({ ...b, [resolvedPose]: true }))}
          />
        ) : (
          // Fallback placeholder until the PNG is dropped into /public/companion/
          <svg viewBox="0 0 72 84" width="72" height="84" aria-hidden="true">
            <ellipse cx="36" cy="80" rx="20" ry="4" fill="rgba(28,58,69,.15)" />
            <rect x="52" y="34" width="7" height="20" rx="3.5" fill="#2f86d6" />
            <rect x="13" y="38" width="7" height="20" rx="3.5" fill="#2f86d6" />
            <ellipse cx="36" cy="48" rx="23" ry="25" fill="#2f86d6" />
            <ellipse cx="36" cy="52" rx="14" ry="16" fill="#eaf4fd" />
            <rect x="26" y="68" width="8" height="12" rx="4" fill="#1c3a45" />
            <rect x="38" y="68" width="8" height="12" rx="4" fill="#244a59" />
            <circle cx="36" cy="24" r="16" fill="#fff" stroke="#2f86d6" strokeWidth="3" />
            <circle cx="30" cy="23" r="2.6" fill="#1c3a45" />
            <circle cx="42" cy="23" r="2.6" fill="#1c3a45" />
            <path d="M30 30 q6 5 12 0" fill="none" stroke="#1c3a45" strokeWidth="2" strokeLinecap="round" />
            <line x1="36" y1="8" x2="36" y2="2" stroke="#2f86d6" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="36" cy="2" r="2.6" fill="#f59e0b" />
          </svg>
        )}
      </button>
    </div>
  );
}
