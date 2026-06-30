/**
 * CompanionAvatar — a coach-like mascot that lives on the RIGHT edge of the
 * screen, roams only the empty side gutter (never over content), and talks to
 * the user with page-aware, data-driven messages: greetings + game suggestions
 * from their cognitive profile (GET /api/me/companion), quick-reply buttons, and
 * encouraging tips inside games. Always visible; the bottom chat can later take
 * over the conversation via a professional LLM.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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

type Pose = 'idle' | 'wave' | 'think' | 'celebrate';
const POSE_SRC: Record<Pose, string> = {
  idle: '/companion/neurostep-bot.png',
  wave: '/companion/neurostep-bot-wave.png',
  think: '/companion/neurostep-bot-think.png',
  celebrate: '/companion/neurostep-bot-celebrate.png',
};

type Ctx = 'home' | 'journey' | 'games' | 'game' | 'other';
interface Reply { label: string; gameId: string }
interface Msg { text: string; cta?: { label: string; gameId: string }; replies?: Reply[] }

// quick "what to work on" chooser — routes straight into a matching game
const CHOOSE: Msg = {
  text: 'על מה בא לך לעבוד עכשיו?',
  replies: [
    { label: 'זיכרון 🧠', gameId: 'memory' },
    { label: 'קשב 🎯', gameId: 'find-letter' },
    { label: 'תגובה ⚡', gameId: 'green-light' },
  ],
};

// Build the message queue for the current page, weaving in the user's data.
function buildMessages(ctx: Ctx, data: CompanionResponse | null): Msg[] {
  if (ctx === 'game') {
    return [
      { text: 'אתה מתקדם יפה — תישאר ממוקד 💪' },
      { text: 'טיפ קטן: קח נשימה לפני כל סבב, זה משפר דיוק 🙂' },
      { text: 'כל תרגול קטן מחזק את המוח. כל הכבוד שאתה כאן!' },
      { text: 'אם זה מאתגר — זה אומר שאתה לומד. תמשיך 🚀' },
    ];
  }
  if (ctx === 'games') {
    return [
      { text: 'בחר אתגר ואני אעזור להתאים לך את המשחק 👇' },
      CHOOSE,
    ];
  }
  // home / journey / other — personalised from the DB profile
  const gameId = data?.suggestedGameId ?? 'memory';
  const gameHe = data?.suggestedGameHe ?? 'זיכרון';
  return [
    { text: data?.greetingHe ?? 'היי! כיף לראות אותך 👋' },
    {
      text: data?.reasonHe ?? 'בא לך אימון קצר ונעים? בוא נתחיל 🙂',
      cta: { label: `בוא נשחק ב${gameHe}`, gameId },
    },
    CHOOSE,
    { text: 'אני המאמן שלך — כאן לאורך כל הדרך 🤖' },
  ];
}

export default function CompanionAvatar() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  const [data, setData] = useState<CompanionResponse | null>(null);
  const [pose, setPose] = useState<Pose>('idle');
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(true);
  const [idx, setIdx] = useState(0);

  const ctx: Ctx = useMemo(() => {
    const p = loc.pathname;
    if (p === '/') return 'home';
    if (p.startsWith('/journey')) return 'journey';
    if (p === '/games') return 'games';
    if (p.startsWith('/games/')) return 'game';
    return 'other';
  }, [loc.pathname]);

  // personalised data (once we have a token); silent fallback otherwise
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getMyCompanion(token).then((r) => {
      if (!cancelled && !isApiError(r)) setData(r);
    });
    return () => { cancelled = true; };
  }, [token]);

  const messages = useMemo(() => buildMessages(ctx, data), [ctx, data]);

  // new page (or data arrived) → restart the conversation with a wave
  useEffect(() => {
    setIdx(0);
    setOpen(true);
    setPose('wave');
    const t = setTimeout(() => setPose('idle'), 2600);
    return () => clearTimeout(t);
  }, [ctx, data]);

  // frequent gentle pushes — cycle through the page's messages
  useEffect(() => {
    if (!open || messages.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 13000);
    return () => clearInterval(t);
  }, [open, messages.length]);

  const goGame = (gameId: string) => {
    setOpen(false);
    navigate(`/games/${GAME_ROUTE[gameId] ?? 'memory'}`);
  };

  const msg = messages[Math.min(idx, messages.length - 1)];
  const resolvedPose: Pose = broken[pose] ? 'idle' : pose;

  return (
    <div className={`companion companion--${ctx} ${open ? 'is-talking' : ''}`} dir="rtl">
      {open && msg && (
        <div className="companion-bubble" role="status">
          <button className="companion-close" onClick={() => setOpen(false)} aria-label="סגור">×</button>
          <p className="companion-greet">{msg.text}</p>
          {msg.cta && (
            <button className="companion-cta" onClick={() => goGame(msg.cta!.gameId)}>
              {msg.cta.label} ←
            </button>
          )}
          {msg.replies && (
            <div className="companion-replies">
              {msg.replies.map((r) => (
                <button key={r.gameId} className="companion-reply" onClick={() => goGame(r.gameId)}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        className="companion-char"
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
