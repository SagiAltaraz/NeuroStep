/**
 * CompanionAvatar — a coach-like mascot that lives on the RIGHT edge of the
 * screen, roams only the empty side gutter (never over content), and talks to
 * the user with page-aware, data-driven messages: greetings + game suggestions
 * from their cognitive profile (GET /api/me/companion), quick-reply buttons, and
 * encouraging tips inside games. Always visible; the bottom chat can later take
 * over the conversation via a professional LLM.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useChatController } from '../../context/ChatControllerContext';
import { useCompanionPresentation } from '../../context/CompanionPresentationContext';
import { getMyCompanion, isApiError, type CompanionResponse } from '../../api/me';
import AvatarClip, { type ClipName } from './AvatarClip';
import { CELEBRATE_EVENT } from './celebrate';
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

// Static poses → animated clips (wave greets by talking). The jet-* clips are
// driven by the flight state machine, not by pose.
const POSE_CLIP: Record<Pose, ClipName> = {
  idle: 'idle',
  wave: 'talk',
  think: 'think',
  celebrate: 'celebrate',
};

// Flight — the jetpack roam cycle over the side gutter:
//   quiet/dismissed → launch → cruise (loops, element roams via CSS)
//   click / re-engage while flying → land → chat opens.
type Flight = 'launch' | 'cruise' | 'land' | null;
const FLIGHT_DELAY_MS = 5000;   // how long after going quiet the jetpack comes out
const GLIDE_HOME_MS = 1500;     // drift back to the anchor during the quiet gap

type Ctx = 'home' | 'journey' | 'games' | 'game' | 'other';
interface Reply { label: string; gameId: string }
interface Msg { text: string; cta?: { label: string; gameId: string }; replies?: Reply[] }

// reading-time pacing: short lines linger less, long lines get time to read.
const readMs = (t: string) => Math.min(11000, Math.max(4200, 2400 + t.length * 55));
// after the page's queue is done, stay quiet this long before a gentle re-engage.
const QUIET_MS = 32000;

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
  const { isOpen: isAiChatOpen, openChat } = useChatController();
  const { isInstructionAvatarVisible } = useCompanionPresentation();
  const navigate = useNavigate();
  const loc = useLocation();

  const [data, setData] = useState<CompanionResponse | null>(null);
  const [pose, setPose] = useState<Pose>('idle');
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(true);
  const [idx, setIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);  // user closed it → stay quiet until next page
  const [videoOk, setVideoOk] = useState(true);       // false → fall back to the PNG poses
  const [flight, setFlight] = useState<Flight>(null);
  const [celebrating, setCelebrating] = useState(false); // level-up → plays the celebrate clip
  const openAfterLand = useRef(false);                // land was triggered by a click/re-engage
  const rootRef = useRef<HTMLDivElement>(null);
  const suppressCompanionRef = useRef(false);
  const pendingContextResetRef = useRef(false);
  const contextResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  );

  const ctx: Ctx = useMemo(() => {
    const p = loc.pathname;
    if (p === '/') return 'home';
    if (p.startsWith('/journey')) return 'journey';
    if (p === '/games') return 'games';
    if (p.startsWith('/games/')) return 'game';
    return 'other';
  }, [loc.pathname]);

  const isJourneyRoute = loc.pathname === '/journey';
  const suppressCompanion = isAiChatOpen || isInstructionAvatarVisible || isJourneyRoute;

  useEffect(() => {
    suppressCompanionRef.current = suppressCompanion;
  }, [suppressCompanion]);

  const cancelContextResetTimer = useCallback(() => {
    if (!contextResetTimerRef.current) return;
    clearTimeout(contextResetTimerRef.current);
    contextResetTimerRef.current = null;
  }, []);

  const resetCompanionContext = useCallback(() => {
    cancelContextResetTimer();
    setIdx(0);
    setOpen(true);
    setDismissed(false);
    setPose('wave');
    setFlight(null);
    openAfterLand.current = false;
    if (rootRef.current) {
      rootRef.current.style.transform = '';
      rootRef.current.style.transition = '';
      rootRef.current.style.animation = '';
    }
    contextResetTimerRef.current = setTimeout(() => {
      setPose('idle');
      contextResetTimerRef.current = null;
    }, 2600);
  }, [cancelContextResetTimer]);

  useEffect(() => () => cancelContextResetTimer(), [cancelContextResetTimer]);

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

  // Route/data changes reset immediately unless AI chat temporarily owns the surface.
  useEffect(() => {
    if (suppressCompanionRef.current) {
      pendingContextResetRef.current = true;
      cancelContextResetTimer();
      return;
    }

    pendingContextResetRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Route/data changes intentionally reset presentation state.
    resetCompanionContext();
  }, [ctx, data, cancelContextResetTimer, resetCompanionContext]);

  // Apply a deferred route/data reset once, when AI chat releases the surface.
  useEffect(() => {
    if (suppressCompanion || !pendingContextResetRef.current) return;
    pendingContextResetRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A deferred context change resets once after chat closes.
    resetCompanionContext();
  }, [suppressCompanion, resetCompanionContext]);

  // Quiet (chat closed or dismissed) → glide back to the anchor if the mascot
  // is still parked where it last landed, then after a short beat the jetpack
  // comes out and it starts roaming the gutter. Clicking it mid-flight lands it.
  // Level-up celebration (fired by SessionResults when a report brings a node
  // promotion). Interrupt whatever the mascot is doing, plant it at its anchor,
  // and let the celebrate clip play; handleClipEnd returns it to idle.
  useEffect(() => {
    const onCelebrate = () => {
      const el = rootRef.current;
      if (el) {
        el.style.animation = '';
        el.style.transition = '';
        el.style.transform = '';
      }
      setFlight(null);
      setOpen(false);
      setPose('celebrate');
      setCelebrating(true);
    };
    window.addEventListener(CELEBRATE_EVENT, onCelebrate);
    return () => window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
  }, []);

  // The video path ends the celebration via the clip's onEnded; the PNG
  // fallback has no such signal, so give it a fixed beat and reset.
  useEffect(() => {
    if (!celebrating || videoOk) return;
    const t = setTimeout(() => { setCelebrating(false); setPose('idle'); }, 4000);
    return () => clearTimeout(t);
  }, [celebrating, videoOk]);

  useEffect(() => {
    if (!suppressCompanion) return;
    openAfterLand.current = false;
    /* eslint-disable react-hooks/set-state-in-effect -- AI chat intentionally moves the companion to quiet state. */
    if (open) setOpen(false);
    if (flight) setFlight(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    const el = rootRef.current;
    if (el) {
      el.style.animation = '';
      el.style.transition = '';
      el.style.transform = '';
    }
  }, [suppressCompanion, open, flight]);

  useEffect(() => {
    if (suppressCompanion || open || flight || celebrating || !videoOk || reducedMotion) return;
    const el = rootRef.current;
    if (el && el.style.transform) {
      // drift home during the quiet gap — done well before the launch fires
      el.style.transition = `transform ${GLIDE_HOME_MS}ms ease-in-out`;
      el.style.transform = 'translate(0px, 0px)';
    }
    // ONE timer owns both the inline cleanup and the launch, so a cancelled
    // effect can never leave a stale inline `animation: none` behind (which
    // would silently disable the roam and pin the mascot to its anchor).
    const t = setTimeout(() => {
      if (el) {
        el.style.transition = '';
        el.style.transform = '';
        el.style.animation = '';
      }
      setFlight('launch');
    }, FLIGHT_DELAY_MS);
    return () => clearTimeout(t);
  }, [open, flight, celebrating, videoOk, reducedMotion, suppressCompanion]);

  // Pin the mascot exactly where it is RIGHT NOW, synchronously, and start the
  // landing there. Must run BEFORE the `companion--flying` class is removed:
  // once the flight animation is gone the roam snaps the element back to its
  // anchor, so reading the transform from an effect (a frame later) is too late.
  const landInPlace = () => {
    const el = rootRef.current;
    if (el) {
      const frozen = getComputedStyle(el).transform;
      el.style.animation = 'none';
      el.style.transition = 'none';
      el.style.transform = frozen === 'none' ? 'translate(0px, 0px)' : frozen;
    }
    setFlight('land');
  };

  // One-shot clips chain here: launch → cruise loop; land → grounded in place
  // (and open the chat if the landing was user-initiated); celebrate → idle.
  const handleClipEnd = (clip: ClipName) => {
    if (suppressCompanion && clip.startsWith('jet-')) return;
    if (clip === 'jet-launch') setFlight('cruise');
    else if (clip === 'jet-land') {
      setFlight(null);
      if (openAfterLand.current) {
        openAfterLand.current = false;
        setIdx(0);
        setOpen(true);
        setDismissed(false);
      }
    } else if (clip === 'celebrate') {
      setCelebrating(false);
      setPose('idle');
    }
  };

  // Smart pacing: linger on each message for its reading time, then move on;
  // once the page's queue is done, go quiet — and only re-engage gently after a
  // long pause. If the user dismissed it, stay quiet until the next page.
  useEffect(() => {
    if (dismissed || suppressCompanion) return;
    if (open) {
      const cur = messages[Math.min(idx, messages.length - 1)];
      const t = setTimeout(() => {
        if (idx < messages.length - 1) setIdx(idx + 1);   // next message
        else setOpen(false);                              // queue done → go quiet
      }, readMs(cur.text));
      return () => clearTimeout(t);
    }
    // quiet → gentle re-engage after a long pause. If it's out flying, bring it
    // in for a landing first — the chat opens when the touchdown completes.
    const t = setTimeout(() => {
      if (flight === 'launch' || flight === 'cruise') {
        openAfterLand.current = true;
        landInPlace();
      } else if (!flight) {
        setIdx(0);
        setOpen(true);
      }
    }, QUIET_MS);
    return () => clearTimeout(t);
    // landInPlace reads refs only; excluding it keeps this from re-firing.
  }, [open, idx, dismissed, messages, flight, suppressCompanion]);

  const goGame = (gameId: string) => {
    setOpen(false);
    navigate(`/games/${GAME_ROUTE[gameId] ?? 'memory'}`);
  };

  const msg = messages[Math.min(idx, messages.length - 1)];
  const resolvedPose: Pose = broken[pose] ? 'idle' : pose;

  // The clip the state machine wants right now. A level-up celebration wins
  // over everything; then flight owns the jet clips; otherwise an open chat
  // talks, and the pose drives the rest.
  const activeFlight = suppressCompanion ? null : flight;
  const clip: ClipName = celebrating
    ? 'celebrate'
    : activeFlight
      ? (`jet-${activeFlight}` as ClipName)
      : open && !suppressCompanion && msg
        ? 'talk'
        : POSE_CLIP[resolvedPose];

  const flying = activeFlight === 'launch' || activeFlight === 'cruise';

  const handleAvatarActivation = () => {
    if (suppressCompanion) return;

    if (ctx === 'home') {
      openChat('avatar');
      return;
    }

    // Non-home routes keep the existing land/toggle behavior.
    if (flying) {
      openAfterLand.current = true;
      landInPlace();
      return;
    }
    if (flight === 'land') return;
    setDismissed(false);
    setOpen((o) => !o);
  };

  if (isInstructionAvatarVisible || isJourneyRoute) return null;

  return (
    <div
      ref={rootRef}
      className={`companion companion--${ctx} ${open && !suppressCompanion ? 'is-talking' : ''} ${flying ? 'companion--flying' : ''} ${suppressCompanion ? 'companion--ai-chat-open' : ''}`}
      dir="rtl"
    >
      {open && msg && !suppressCompanion && (
        <div className="companion-bubble" role="status">
          <button className="companion-close" onClick={() => { setOpen(false); setDismissed(true); }} aria-label="סגור">×</button>
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
        onClick={handleAvatarActivation}
        aria-label={ctx === 'home' ? 'Open AI assistant' : 'המאמן שלי'}
        title={ctx === 'home' ? 'Open AI assistant' : 'המאמן שלי'}
      >
        {videoOk ? (
          <AvatarClip
            clip={clip}
            className="companion-video"
            onEnded={handleClipEnd}
            onFail={() => { setVideoOk(false); setFlight(null); }}
          />
        ) : !broken.idle ? (
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
