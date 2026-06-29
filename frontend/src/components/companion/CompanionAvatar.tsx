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

export default function CompanionAvatar() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<CompanionResponse | null>(null);
  const [open, setOpen] = useState(false);

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
    })();
    return () => { cancelled = true; };
  }, [token, user]);

  if (!user || !data) return null;

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
        className="companion-char"
        onClick={() => setOpen((o) => !o)}
        aria-label="המאמן שלי"
        title="המאמן שלי"
      >
        <svg viewBox="0 0 72 84" width="72" height="84" aria-hidden="true">
          <ellipse cx="36" cy="80" rx="20" ry="4" fill="rgba(28,58,69,.15)" />
          {/* waving arm */}
          <g className="cm-arm">
            <rect x="52" y="34" width="7" height="20" rx="3.5" fill="#2f86d6" />
          </g>
          <rect x="13" y="38" width="7" height="20" rx="3.5" fill="#2f86d6" />
          {/* body */}
          <ellipse cx="36" cy="48" rx="23" ry="25" fill="#2f86d6" />
          <ellipse cx="36" cy="52" rx="14" ry="16" fill="#eaf4fd" />
          {/* legs */}
          <rect x="26" y="68" width="8" height="12" rx="4" fill="#1c3a45" />
          <rect x="38" y="68" width="8" height="12" rx="4" fill="#244a59" />
          {/* head */}
          <circle cx="36" cy="24" r="16" fill="#fff" stroke="#2f86d6" strokeWidth="3" />
          <circle cx="30" cy="23" r="2.6" fill="#1c3a45" />
          <circle cx="42" cy="23" r="2.6" fill="#1c3a45" />
          <path d="M30 30 q6 5 12 0" fill="none" stroke="#1c3a45" strokeWidth="2" strokeLinecap="round" />
          {/* little antenna (brain spark) */}
          <line x1="36" y1="8" x2="36" y2="2" stroke="#2f86d6" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="36" cy="2" r="2.6" fill="#f59e0b" />
        </svg>
      </button>
    </div>
  );
}
