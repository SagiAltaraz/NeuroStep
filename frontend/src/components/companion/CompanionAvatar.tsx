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
import { useChatController, type ChatAnchor } from '../../context/ChatControllerContext';
import { useCompanionPresentation } from '../../context/CompanionPresentationContext';
import { useLang, type Lang, type TKey } from '../../context/LanguageContext';
import {
  getMyCompanion,
  isApiError,
  updateMyChatSessionMood,
  type CompanionMoodSelection,
  type CompanionContext,
  type CompanionResponse,
  type CompanionSuggestion,
} from '../../api/me';
import { getPersonalizationProfile } from '../../api/auth';
import { getStoredChatSessionId } from '../chat-assistant/chatSessionStorage';
import { GAME_INSTRUCTIONS } from '../../data/gameInstructions';
import { COGNITIVE_PROBLEMS } from '../../data/cognitiveProblems';
import AvatarClip, { type ClipName } from './AvatarClip';
import { CELEBRATE_EVENT } from './celebrate';
import { COACHING_TOAST_EVENT } from '../ui/CoachingToast';
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
type UserGender = 'male' | 'female' | 'neutral';
interface Reply { label: string; gameId: string }
interface MoodReply { label: string; value: 'alert' | 'tired' }
interface Msg {
  title?: string;
  text: string;
  durationMs?: number;
  cta?: { label: string; gameId?: string; action?: 'open-chat' | 'browse-games' };
  replies?: Reply[];
  moodReplies?: MoodReply[];
  links?: { label: string; to: string }[];   // plain route buttons (log in / sign up)
  dir?: 'rtl' | 'ltr';
}

type Translate = (key: TKey) => string;

// reading-time pacing: short lines linger less, long lines get time to read.
const readMs = (t: string) => Math.min(11000, Math.max(4200, 2400 + t.length * 55));
// after the page's queue is done, stay quiet this long before a gentle re-engage.
const QUIET_MS = 32000;
const COACHING_TOAST_MS = 4000;

// The "how are you feeling?" check-in is asked at most once per calendar day.
const MOOD_ASK_KEY = 'neurostep:moodAskedDate';
const MOOD_PICK_KEY = 'neurostep:mood';
const todayStr = () => new Date().toISOString().slice(0, 10);
const askedMoodToday = () => {
  try { return localStorage.getItem(MOOD_ASK_KEY) === todayStr(); } catch { return false; }
};
function inferUserGender(profile: unknown): UserGender {
  const record = profile as {
    personalizationQuestionnaire?: Array<{
      questionId?: unknown;
      selectedOptionIds?: unknown;
      answersEn?: unknown;
      answersHe?: unknown;
    }>;
    personalizationAnswers?: Record<string, unknown>;
  } | null;

  const genderEntry = record?.personalizationQuestionnaire?.find((entry) => entry.questionId === 2);
  const selectedIds = Array.isArray(genderEntry?.selectedOptionIds)
    ? genderEntry.selectedOptionIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (selectedIds.includes('female')) return 'female';
  if (selectedIds.includes('male')) return 'male';

  const answer = String(record?.personalizationAnswers?.[2] ?? record?.personalizationAnswers?.['2'] ?? '').toLowerCase();
  if (answer.includes('female') || answer.includes('נקבה')) return 'female';
  if (answer.includes('male') || answer.includes('זכר')) return 'male';
  return 'neutral';
}

function adaptHebrewForGender(text: string, gender: UserGender, lang: Lang): string {
  if (lang !== 'he' || gender !== 'female') return text;

  return text
    .replace(/אתה משקיע/g, 'את משקיעה')
    .replace(/אתה במיטבך/g, 'את במיטבך')
    .replace(/אתה בזרימה/g, 'את בזרימה')
    .replace(/אתה תופס/g, 'את תופסת')
    .replace(/אתה נע/g, 'את נעה')
    .replace(/אתה עף/g, 'את עפה')
    .replace(/אתה במצב/g, 'את במצב')
    .replace(/אתה רגוע/g, 'את רגועה')
    .replace(/אתה שולט/g, 'את שולטת')
    .replace(/אתה רואה/g, 'את רואה')
    .replace(/אתה ממש מדייק/g, 'את ממש מדייקת')
    .replace(/אתה לא מוותר/g, 'את לא מוותרת')
    .replace(/אתה ממשיך/g, 'את ממשיכה')
    .replace(/אתה עושה/g, 'את עושה')
    .replace(/אתה חזק/g, 'את חזקה')
    .replace(/אתה מתמיד/g, 'את מתמידה')
    .replace(/אתה עובר/g, 'את עוברת')
    .replace(/אתה תצליח/g, 'את תצליחי')
    .replace(/אתה מתקדם/g, 'את מתקדמת')
    .replace(/אתה בדרך/g, 'את בדרך')
    .replace(/אתה מסוגל/g, 'את מסוגלת')
    .replace(/אתה לא לבד/g, 'את לא לבד')
    .replace(/גאה בך שאתה כאן/g, 'גאה בך שאת כאן')
    .replace(/שאתה עושה/g, 'שאת עושה')
    .replace(/שאתה לומד/g, 'שאת לומדת')
    .replace(/שאתה כאן/g, 'שאת כאן')
    .replace(/תמשיך/g, 'תמשיכי')
    .replace(/שמור/g, 'שמרי')
    .replace(/המשך/g, 'המשיכי')
    .replace(/תן לעצמך/g, 'תני לעצמך')
    .replace(/נשום/g, 'נשמי')
    .replace(/שאף/g, 'שאפי')
    .replace(/תאמין/g, 'תאמיני')
    .replace(/קח את הזמן שלך/g, 'קחי את הזמן שלך')
    .replace(/בוא נתמקד/g, 'בואי נתמקד')
    .replace(/בוא ננצל/g, 'בואי ננצל')
    .replace(/בוא נתחיל/g, 'בואי נתחיל')
    .replace(/בוא נשחק/g, 'בואי נשחק')
    .replace(/בוא נמשיך/g, 'בואי נמשיך')
    .replace(/בוא נחזק/g, 'בואי נחזק')
    .replace(/בחר תחום/g, 'בחרי תחום')
    .replace(/בחר אחד/g, 'בחרי אחד')
    .replace(/לחץ עליי/g, 'לחצי עליי')
    .replace(/פשוט לחץ/g, 'פשוט לחצי')
    .replace(/התחל את/g, 'התחילי את')
    .replace(/התחל/g, 'התחילי')
    .replace(/פתח את/g, 'פתחי את')
    .replace(/עיין/g, 'עייני')
    .replace(/מוכן/g, 'מוכנה')
    .replace(/עירני/g, 'עירנית')
    .replace(/עֵר/g, 'עֵרה')
    .replace(/עייף/g, 'עייפה')
    .replace(/אתה/g, 'את');
}
// quick "what to work on" chooser — routes straight into a matching game.
// Language-aware so the mascot speaks the selected UI language everywhere.
function buildChoose(t: Translate, lang: Lang, gender: UserGender): Msg {
  const gt = (key: TKey) => adaptHebrewForGender(t(key), gender, lang);
  return {
    text: gt('companion.choose.title'),
    replies: [
      { label: gt('companion.choose.memory'), gameId: 'memory' },
      { label: gt('companion.choose.attention'), gameId: 'find-letter' },
      { label: gt('companion.choose.reaction'), gameId: 'green-light' },
    ],
  };
}

// Build the message queue for the current page, weaving in the user's data.
// `gameName` (when on a specific game) lets the in-game coaching speak to the
// actual game the player is in, in a warm, personal voice — in the UI language.
function buildMessages(
  ctx: Ctx,
  data: CompanionResponse | null,
  t: Translate,
  lang: Lang,
  gameName?: string,
  gender: UserGender = 'neutral',
): Msg[] {
  const gt = (key: TKey) => adaptHebrewForGender(t(key), gender, lang);
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const fmt = (key: TKey, params: Record<string, string>) =>
    adaptHebrewForGender(formatSuggestionText(t(key), params) ?? t(key), gender, lang);

  if (ctx === 'game') {
    const g = gameName ?? gt('companion.game.thisTraining');
    return [
      { text: fmt('companion.game.tip.focus', { game: g }), dir },
      { text: gt('companion.game.tip.breath'), dir },
      { text: fmt('companion.game.tip.strengthen', { game: g }), dir },
      { text: gt('companion.game.tip.learning'), dir },
    ];
  }
  if (ctx === 'games') {
    return [
      { text: gt('companion.games.intro'), dir },
      buildChoose(t, lang, gender),
    ];
  }
  // home / journey / other — personalised from the DB profile, localized.
  const gameId = data?.suggestedGameId ?? 'memory';
  const gameKey = GAME_ROUTE[gameId] ?? 'memory';
  const gameName2 = GAME_INSTRUCTIONS[gameKey]?.title[lang]
    ?? (lang === 'he' ? data?.suggestedGameHe : undefined)
    ?? GAME_INSTRUCTIONS.memory.title[lang];
  return [
    { text: adaptHebrewForGender((lang === 'he' ? data?.greetingHe : undefined) ?? gt('companion.home.greetingFallback'), gender, lang), dir },
    {
      text: adaptHebrewForGender((lang === 'he' ? data?.reasonHe : undefined) ?? gt('companion.home.reasonFallback'), gender, lang),
      cta: { label: fmt('companion.home.ctaPlay', { game: gameName2 }), gameId },
      dir,
    },
    buildChoose(t, lang, gender),
    { text: gt('companion.home.coach'), dir },
  ];
}

function buildFallbackSuggestions(
  ctx: Ctx,
  data: CompanionResponse | null,
  lang: Lang,
  t: Translate,
  gender: UserGender,
): Msg[] {
  const gt = (key: TKey) => adaptHebrewForGender(t(key), gender, lang);
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const suggestedGameId = data?.suggestedGameId ?? 'memory';
  const gameKey = GAME_ROUTE[suggestedGameId] ?? 'memory';
  const gameName = GAME_INSTRUCTIONS[gameKey]?.title[lang]
    ?? (lang === 'he' ? data?.suggestedGameHe : undefined)
    ?? GAME_INSTRUCTIONS.memory.title[lang];
  const recommendation: Msg = {
    text: `${gt('companion.recommended')} ${gameName}`,
    cta: { label: `${gt('companion.play')} ${gameName}`, gameId: suggestedGameId },
    dir,
  };

  if (ctx === 'home') {
    return data
      ? [recommendation, { text: gt('companion.home.openAssistant'), dir }]
      : [
          { text: gt('companion.home.openAssistant'), dir },
          {
            text: gt('companion.home.startTraining'),
            cta: recommendation.cta,
            dir,
          },
        ];
  }

  if (ctx === 'games') {
    return [
      ...(data ? [recommendation] : []),
      { text: gt('companion.games.select'), dir },
    ];
  }

  if (ctx === 'journey') {
    const focusItem = data?.plan?.items[0];
    if (!focusItem) {
      return [{ text: t('journey.avatar.plan.pending'), dir }];
    }
    return [{
      text: `${t('journey.avatar.plan.focus')}: ${t(
        `problem.${focusItem.domainId}.title` as TKey,
      )} · ${focusItem.sessionsPerWeek} ${t('journey.avatar.plan.sessions')}`,
      dir,
    }];
  }

  return [];
}

const SUGGESTION_MESSAGE_KEYS: Record<string, TKey> = {
  'companion.suggestion.plan-game': 'companion.suggestion.plan-game',
  'companion.suggestion.open-assistant': 'companion.suggestion.open-assistant',
  'companion.suggestion.browse-games': 'companion.suggestion.browse-games',
  'companion.suggestion.recorded-level': 'companion.suggestion.recorded-level',
  'companion.suggestion.journey-map': 'companion.suggestion.journey-map',
  'companion.suggestion.weekly-plan': 'companion.suggestion.weekly-plan',
  'companion.suggestion.next-activity': 'companion.suggestion.next-activity',
  'companion.suggestion.same-domain-pair': 'companion.suggestion.same-domain-pair',
};

const SUGGESTION_ACTION_KEYS: Record<string, TKey> = {
  'companion.action.start-game': 'companion.action.start-game',
  'companion.action.open-assistant': 'companion.action.open-assistant',
  'companion.action.browse-games': 'companion.action.browse-games',
};

function formatSuggestionText(
  template: string,
  params: Record<string, string>,
): string | null {
  const text = template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    params[key] ?? placeholder
  );
  return text.includes('{') ? null : text;
}

function suggestionParams(
  suggestion: CompanionSuggestion,
  lang: Lang,
  t: Translate,
): Record<string, string> | null {
  const params: Record<string, string> = {};
  const raw = suggestion.messageParams ?? {};
  const gameId = suggestion.action?.gameId ?? raw.gameId;

  if (gameId !== undefined) {
    if (typeof gameId !== 'string') return null;
    const gameKey = GAME_ROUTE[gameId];
    const game = gameKey ? GAME_INSTRUCTIONS[gameKey] : undefined;
    if (!game) return null;
    params.game = game.title[lang];
  }

  if (raw.domainId !== undefined) {
    if (
      typeof raw.domainId !== 'string' ||
      !COGNITIVE_PROBLEMS.some((problem) => problem.id === raw.domainId)
    ) {
      return null;
    }
    params.domain = t(('problem.' + raw.domainId + '.title') as TKey);
  }

  for (const key of ['level', 'sessionsPerWeek', 'weeklySessions']) {
    const value = raw[key];
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      params[key] = String(Math.round(value));
    }
  }

  return params;
}

function backendSuggestionMessage(
  suggestion: CompanionSuggestion,
  lang: Lang,
  t: Translate,
  gender: UserGender,
): Msg | null {
  const messageKey = SUGGESTION_MESSAGE_KEYS[suggestion.messageKey];
  if (!messageKey) return null;

  const params = suggestionParams(suggestion, lang, t);
  if (!params) return null;
  const text = adaptHebrewForGender(formatSuggestionText(t(messageKey), params) ?? '', gender, lang);
  if (!text) return null;

  // Same-domain pair: two games for one cognitive problem, shown as two
  // reply buttons in a single message (spec: not one after another).
  if (suggestion.kind === 'recommended-pair') {
    const gameTitle = (gameId?: string): string | null => {
      const gameKey = gameId ? GAME_ROUTE[gameId] : undefined;
      const game = gameKey ? GAME_INSTRUCTIONS[gameKey] : undefined;
      return game ? game.title[lang] : null;
    };
    const g1 = suggestion.action?.gameId;
    const g2 = suggestion.secondaryAction?.gameId;
    const l1 = gameTitle(g1);
    const l2 = gameTitle(g2);
    if (!g1 || !g2 || !l1 || !l2) return null;
    return {
      text,
      replies: [{ label: l1, gameId: g1 }, { label: l2, gameId: g2 }],
      dir: lang === 'he' ? 'rtl' : 'ltr',
    };
  }

  let cta: Msg['cta'];
  if (suggestion.action) {
    const labelKey = SUGGESTION_ACTION_KEYS[suggestion.action.labelKey];
    if (!labelKey) return null;
    const label = adaptHebrewForGender(formatSuggestionText(t(labelKey), params) ?? '', gender, lang);
    if (!label) return null;

    if (suggestion.action.type === 'open-game') {
      const gameId = suggestion.action.gameId;
      const gameKey = gameId ? GAME_ROUTE[gameId] : undefined;
      if (!gameId || !gameKey || suggestion.action.route !== '/games/' + gameKey) {
        return null;
      }
      cta = { label, gameId };
    } else if (suggestion.action.type === 'open-chat') {
      cta = { label, action: 'open-chat' };
    } else if (
      suggestion.action.type === 'open-route' &&
      suggestion.action.route === '/games'
    ) {
      cta = { label, action: 'browse-games' };
    } else {
      return null;
    }
  }

  return { text, cta, dir: lang === 'he' ? 'rtl' : 'ltr' };
}

function buildBackendMessages(
  data: CompanionResponse,
  expectedContext: CompanionContext,
  lang: Lang,
  t: Translate,
  gender: UserGender,
): Msg[] | null {
  if (
    data.dataVersion !== 'companion-suggestions-v1' ||
    data.context !== expectedContext ||
    !Array.isArray(data.suggestions) ||
    data.suggestions.length === 0
  ) {
    return null;
  }

  const messages: Msg[] = [];
  for (const suggestion of data.suggestions) {
    const message = backendSuggestionMessage(suggestion, lang, t, gender);
    if (!message) return null;
    messages.push(message);
  }
  return messages;
}

export default function CompanionAvatar() {
  const { token, user } = useAuth();
  const { lang, t } = useLang();
  const { isOpen: isAiChatOpen, openChat, closeChat, status: chatStatus, anchor: chatAnchor, setAnchor: setChatAnchor } = useChatController();
  const { isInstructionAvatarVisible, isResultAvatarVisible } = useCompanionPresentation();
  const navigate = useNavigate();
  const loc = useLocation();

  const [companionResult, setCompanionResult] = useState<{
    token: string;
    context: CompanionContext;
    response: CompanionResponse;
  } | null>(null);
  const [pose, setPose] = useState<Pose>('idle');
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(true);
  const [idx, setIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);  // user closed it → stay quiet until next page
  const [moodPicked, setMoodPicked] = useState<CompanionMoodSelection | null>(null);
  const [videoOk, setVideoOk] = useState(true);       // false → fall back to the PNG poses
  const [flight, setFlight] = useState<Flight>(null);
  const [celebrating, setCelebrating] = useState(false); // level-up → plays the celebrate clip
  const [profileGender, setProfileGender] = useState<{ userId: string | null; gender: UserGender } | null>(null);
  const [coachingToastMessage, setCoachingToastMessage] = useState<string | null>(null);
  const openAfterLand = useRef(false);                // land was triggered by a click/re-engage
  const openAfterLaunch = useRef(false);
  const openChatAfterLand = useRef(false);            // land → open the AI chat (not the scripted bubble)
  const pendingChatAnchor = useRef<ChatAnchor | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const suppressCompanionRef = useRef(false);
  const pendingContextResetRef = useRef(false);
  const contextResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coachingToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const backendContext = useMemo<CompanionContext | null>(() => {
    if (ctx === 'home') return 'home';
    if (ctx === 'games') return 'games';
    return null;
  }, [ctx]);

  const data =
    token &&
    backendContext &&
    companionResult?.token === token &&
    companionResult.context === backendContext
      ? companionResult.response
      : null;
  const isJourneyRoute = loc.pathname === '/journey';
  const suppressCompanion =
    isAiChatOpen || isInstructionAvatarVisible || isResultAvatarVisible || isJourneyRoute;

  useEffect(() => {
    suppressCompanionRef.current = suppressCompanion;
  }, [suppressCompanion]);

  useEffect(() => {
    if (!token) return;

    const userId = user?.id ?? null;
    let cancelled = false;
    getPersonalizationProfile(token)
      .then((profile) => {
        if (cancelled) return;
        setProfileGender({
          userId,
          gender: isApiError(profile) ? 'neutral' : inferUserGender(profile),
        });
      })
      .catch(() => {
        if (!cancelled) setProfileGender({ userId, gender: 'neutral' });
      });

    return () => {
      cancelled = true;
    };
  }, [token, user?.id]);

  useEffect(() => {
    const onCoachingToast = (event: Event) => {
      const message = (event as CustomEvent<{ message?: unknown }>).detail?.message;
      if (typeof message !== 'string' || message.trim().length === 0) return;
      if (coachingToastTimerRef.current) clearTimeout(coachingToastTimerRef.current);
      setCoachingToastMessage(message);
      coachingToastTimerRef.current = setTimeout(() => {
        setCoachingToastMessage(null);
        coachingToastTimerRef.current = null;
      }, COACHING_TOAST_MS);
    };

    window.addEventListener(COACHING_TOAST_EVENT, onCoachingToast);
    return () => {
      window.removeEventListener(COACHING_TOAST_EVENT, onCoachingToast);
      if (coachingToastTimerRef.current) clearTimeout(coachingToastTimerRef.current);
    };
  }, []);

  const cancelContextResetTimer = useCallback(() => {
    if (!contextResetTimerRef.current) return;
    clearTimeout(contextResetTimerRef.current);
    contextResetTimerRef.current = null;
  }, []);

  const resetCompanionContext = useCallback(() => {
    cancelContextResetTimer();
    setIdx(0);
    setOpen(ctx !== 'game');
    setDismissed(false);
    // Drop any just-picked mood ack; whether we asked today is remembered in
    // localStorage, so returning to home simply skips the check-in.
    setMoodPicked(null);
    setPose(ctx === 'home' ? 'idle' : 'wave');
    setFlight(null);
    openAfterLand.current = false;
    openAfterLaunch.current = false;
    if (rootRef.current) {
      rootRef.current.style.transform = '';
      rootRef.current.style.transition = '';
      rootRef.current.style.animation = '';
      rootRef.current.style.left = '';
      rootRef.current.style.top = '';
      rootRef.current.style.right = '';
      rootRef.current.style.bottom = '';
      delete rootRef.current.dataset.pinned;
    }
    if (ctx !== 'home') {
      contextResetTimerRef.current = setTimeout(() => {
        setPose('idle');
        contextResetTimerRef.current = null;
      }, 2600);
    }
  }, [cancelContextResetTimer, ctx]);

  useEffect(() => () => cancelContextResetTimer(), [cancelContextResetTimer]);

  // Fetch only for supported global-companion contexts. The token/context pair
  // stored with the response prevents a late request from replacing newer data.
  useEffect(() => {
    if (!token || !backendContext) return;
    let cancelled = false;
    const requestedToken = token;
    const requestedContext = backendContext;

    getMyCompanion(requestedToken, requestedContext).then((response) => {
      if (
        cancelled ||
        isApiError(response) ||
        response.context !== requestedContext
      ) {
        return;
      }
      setCompanionResult({
        token: requestedToken,
        context: requestedContext,
        response,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [token, backendContext]);

  const effectiveGender = token && profileGender?.userId === (user?.id ?? null) ? profileGender.gender : 'neutral';

  const messages = useMemo(() => {
    // Logged out: no tips, no game recommendations — just a welcome and the way
    // in. Everything the mascot says is personal, and there is no one to talk to
    // yet. The AI chat enforces the same rule.
    if (!token) {
      return [{
        title: t('guest.welcome.title'),
        text: adaptHebrewForGender(t('guest.welcome.text'), effectiveGender, lang),
        dir: lang === 'he' ? 'rtl' : 'ltr',
        links: [
          { label: t('header.login'), to: '/log-in' },
          { label: t('header.signup'), to: '/sign-up' },
        ],
      } satisfies Msg];
    }

    // Which specific game are we in? Lets the in-game voice name it.
    const gameKey = ctx === 'game'
      ? Object.values(GAME_ROUTE).find((k) => loc.pathname === `/games/${k}`)
      : undefined;
    const gameName = gameKey ? GAME_INSTRUCTIONS[gameKey]?.title[lang] : undefined;

    const homeIntro: Msg = {
      title: user?.name
        ? `${t('companion.home.hello')} \u2068${user.name}\u2069`
        : t('companion.home.hello'),
      text: adaptHebrewForGender(t('companion.home.introduction'), effectiveGender, lang),
      dir: lang === 'he' ? 'rtl' : 'ltr',
    };
    const homeMood: Msg = {
      title: adaptHebrewForGender(t('companion.home.moodTitle'), effectiveGender, lang),
      text: '',
      durationMs: 16000,
      moodReplies: [
        { label: adaptHebrewForGender(t('companion.home.moodAlert'), effectiveGender, lang), value: 'alert' },
        { label: adaptHebrewForGender(t('companion.home.moodTired'), effectiveGender, lang), value: 'tired' },
      ],
      dir: lang === 'he' ? 'rtl' : 'ltr',
    };
    // Mood check-in flow:
    //  • once the user picks, replace the question with a warm, human reply and
    //    keep the conversation going (never stop after a mood pick);
    //  • the question itself is asked at most once per calendar day.
    const dir = lang === 'he' ? 'rtl' : 'ltr';
    const moodAck: Msg | null = moodPicked
      ? {
          text: adaptHebrewForGender(t(moodPicked === 'alert'
            ? 'companion.home.moodAckAlert'
            : 'companion.home.moodAckTired'), effectiveGender, lang),
          dir,
        }
      : null;
    const homeMoodSlot: Msg | null =
      moodAck ?? (!askedMoodToday() ? homeMood : null);
    const planDomains = Array.from(new Set(
      (data?.plan?.items ?? [])
        .filter((item) => COGNITIVE_PROBLEMS.some((problem) => problem.id === item.domainId))
        .slice(0, 3)
        .map((item) => t(`problem.${item.domainId}.title` as TKey)),
    ));
    const homePlan: Msg | null = planDomains.length > 0
      ? {
          text: adaptHebrewForGender(formatSuggestionText(t('companion.home.planRecommendation'), {
            domains: planDomains.join(', '),
          }) ?? '', effectiveGender, lang),
          dir: lang === 'he' ? 'rtl' : 'ltr',
        }
      : null;
    const homeOpeningMessages = [
      homeIntro,
      ...(homeMoodSlot ? [homeMoodSlot] : []),
      ...(homePlan ? [homePlan] : []),
    ];
    if (data && backendContext) {
      const backendMessages = buildBackendMessages(data, backendContext, lang, t, effectiveGender);
      if (backendMessages) {
        return ctx === 'home' ? [...homeOpeningMessages, ...backendMessages] : backendMessages;
      }
    }

    const baseMessages = buildMessages(ctx, null, t, lang, gameName, effectiveGender);
    const suggestions = buildFallbackSuggestions(ctx, null, lang, t, effectiveGender);
    if (ctx === 'home') {
      return [...homeOpeningMessages, ...baseMessages.slice(0, 2), ...suggestions, ...baseMessages.slice(2)];
    }
    if (ctx === 'games') {
      return [...baseMessages, ...suggestions];
    }
    if (ctx === 'journey') {
      return [baseMessages[0], ...suggestions, ...baseMessages.slice(1)];
    }
    return baseMessages;
  }, [ctx, data, backendContext, lang, t, token, user, moodPicked, loc.pathname, effectiveGender]);
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
    openAfterLaunch.current = false;
    /* eslint-disable react-hooks/set-state-in-effect -- AI chat intentionally moves the companion to quiet state. */
    if (open) setOpen(false);
    if (flight) setFlight(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    const el = rootRef.current;
    // For non-chat suppression (instructions / results / journey) clear any
    // leftover inline positioning. The AI-chat freeze is handled purely by the
    // CSS pause, so nothing to undo here for that case.
    if (el && !isAiChatOpen) {
      el.style.animation = '';
      el.style.transition = '';
      el.style.transform = '';
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
    }
  }, [suppressCompanion, open, flight, isAiChatOpen]);

  useEffect(() => {
    // Once the mascot is idle and unused (no open message, not already flying),
    // it takes off and roams the gutter — on every page, home included, so the
    // flight animation is always put to use instead of the mascot sitting still.
    if (
      suppressCompanion ||
      open ||
      flight ||
      celebrating ||
      !videoOk ||
      reducedMotion
    ) return;
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
        el.style.left = '';
        el.style.top = '';
        el.style.right = '';
        el.style.bottom = '';
        delete el.dataset.pinned;
      }
      setFlight('launch');
    }, FLIGHT_DELAY_MS);
    return () => clearTimeout(t);
  }, [open, flight, celebrating, videoOk, reducedMotion, suppressCompanion, ctx]);

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

  // MEASURE the mascot's current on-screen spot and return the chat anchor for
  // it. We do NOT touch its transform: the freeze is done purely by PAUSING the
  // CSS roam (the `companion--ai-chat-open` class), which holds the mascot at its
  // current frame and — crucially — RESUMES from that same frame on close, so
  // there's no snap on open OR close.
  const measureAvatarAnchor = useCallback((): ChatAnchor | null => {
    const el = rootRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // Guard against a degenerate measurement (e.g. a not-yet-laid-out or
    // backgrounded viewport reporting 0 width).
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw <= 0 || vh <= 0 || rect.width === 0 || rect.right <= 0 || rect.left >= vw) {
      return null;
    }
    const gap = 12;
    const right = Math.max(12, Math.round(vw - rect.right));
    // Prefer opening the chat ABOVE the mascot; but if it's roamed too high to
    // leave room for the bubble, open it BELOW instead so it's never cut off.
    const roomAbove = rect.top;
    if (roomAbove >= 260) {
      return { right, bottom: Math.max(12, Math.round(vh - rect.top + gap)) };
    }
    return { right, top: Math.max(64, Math.round(rect.bottom + gap)) };
  }, []);

  const openChatAtAvatar = useCallback(() => {
    openChat('avatar', measureAvatarAnchor());
  }, [openChat, measureAvatarAnchor]);

  // When the chat opens by any OTHER route (launcher button, a message CTA),
  // anchor the bubble to the avatar's current spot too. Runs after the pause has
  // applied, so it measures the exact frozen position. Only sets it if the open
  // path didn't already provide an anchor.
  useEffect(() => {
    if (!isAiChatOpen || chatAnchor) return;
    setChatAnchor(measureAvatarAnchor());
  }, [isAiChatOpen, chatAnchor, measureAvatarAnchor, setChatAnchor]);

  // One-shot clips chain here: launch → cruise loop; land → grounded in place
  // (and open the chat if the landing was user-initiated); celebrate → idle.
  const handleClipEnd = (clip: ClipName) => {
    if (suppressCompanion && clip.startsWith('jet-')) return;
    if (clip === 'jet-launch' && openAfterLaunch.current) {
      setFlight('cruise');
    } else if (clip === 'jet-launch') setFlight('cruise');
    else if (clip === 'jet-land') {
      setFlight(null);
      if (openChatAfterLand.current) {
        // Touchdown finished → open the AI chat anchored to where it landed.
        openChatAfterLand.current = false;
        openChat('avatar', pendingChatAnchor.current);
        pendingChatAnchor.current = null;
      } else if (openAfterLand.current) {
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

  useEffect(() => {
    if (ctx !== 'home' || flight !== 'cruise' || !openAfterLaunch.current) return;
    const timer = setTimeout(() => {
      openAfterLaunch.current = false;
      setFlight(null);
      openChatAtAvatar();
    }, 700);
    return () => clearTimeout(timer);
  }, [ctx, flight, openChatAtAvatar]);

  // Smart pacing: linger on each message for its reading time, then move on;
  // once the page's queue is done, go quiet — and only re-engage gently after a
  // long pause. If the user dismissed it, stay quiet until the next page.
  useEffect(() => {
    if (dismissed || suppressCompanion) return;
    if (open) {
      const cur = messages[Math.min(idx, messages.length - 1)];
      const t = setTimeout(() => {
        if (ctx === 'game') setOpen(false);               // no automatic game coaching rotation
        else if (idx < messages.length - 1) setIdx(idx + 1); // next message
        else setOpen(false);   // queue done (home included) → go quiet so it can take off
      }, cur.durationMs ?? readMs(cur.text));
      return () => clearTimeout(t);
    }
    if (ctx === 'game') return;
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
  }, [open, idx, dismissed, messages, flight, suppressCompanion, ctx]);

  const goGame = (gameId: string) => {
    setOpen(false);
    navigate(`/games/${GAME_ROUTE[gameId] ?? 'memory'}`);
  };

  const msg = messages[Math.min(idx, messages.length - 1)];

  const selectMood = (selection: CompanionMoodSelection) => {
    if (!token) return;
    const sessionId = getStoredChatSessionId();
    if (!sessionId) return;

    // Persist the mood (game warm-up reads it) and mark that we asked today, so
    // the check-in won't reappear on every visit to the main page.
    try {
      localStorage.setItem(MOOD_PICK_KEY, selection);
      localStorage.setItem(MOOD_ASK_KEY, todayStr());
    } catch { /* ignore */ }

    // Keep the conversation going: swap the question for a warm, human reply and
    // let the queue continue — never lock the UI or stop after a mood pick.
    setMoodPicked(selection);
    setOpen(true);
    updateMyChatSessionMood(token, sessionId, selection).catch(() => {
      /* mood is best-effort */
    });
  };

  const activateMessageCta = () => {
    const cta = msg?.cta;
    if (!cta) return;
    if (cta.gameId) {
      goGame(cta.gameId);
    } else if (cta.action === 'open-chat') {
      openChatAtAvatar();
    } else if (cta.action === 'browse-games') {
      setOpen(false);
      navigate('/games');
    }
  };
  const resolvedPose: Pose = broken[pose] ? 'idle' : pose;

  // The clip the state machine wants right now. A level-up celebration wins
  // over everything; then, while the AI chat is open, the avatar mirrors the
  // chat status (think → talk → idle); then flight owns the jet clips; otherwise
  // a dialogue message talks while speaking and idles while awaiting a reply.
  const activeFlight = suppressCompanion ? null : flight;
  const clip: ClipName = celebrating
    ? 'celebrate'
    : isAiChatOpen
      ? (chatStatus === 'thinking' ? 'think' : chatStatus === 'answering' ? 'talk' : 'idle')
      : activeFlight
        ? (`jet-${activeFlight}` as ClipName)
        : open && !suppressCompanion && msg
          // talk while "speaking" a plain line; idle while a choice awaits the user
          ? (msg.moodReplies ? 'think' : (msg.replies || msg.cta) ? 'idle' : 'talk')
          : POSE_CLIP[resolvedPose];

  const flying = activeFlight === 'launch' || activeFlight === 'cruise';

  const handleAvatarActivation = () => {
    // Clicking the mascot while the AI chat is open closes it (the chat has no
    // × button — the avatar is the toggle).
    if (isAiChatOpen) { closeChat(); return; }
    if (suppressCompanion) return;

    // On EVERY page, clicking the mascot freezes it EXACTLY where it is and opens
    // the AI chat right there. We deliberately do NOT play the jet-land clip on
    // click: cruise→land is a video seam that made the robot hop up-then-down.
    // Freezing the transform and cross-fading straight to the idle/talk clip
    // (which shares the hub pose) is seamless — no jump.
    if (flying) setFlight(null);
    openChatAtAvatar();
  };

  if (isInstructionAvatarVisible || isResultAvatarVisible || isJourneyRoute) return null;

  return (
    <div
      ref={rootRef}
      className={`companion companion--${ctx} ${open && !suppressCompanion ? 'is-talking' : ''} ${flying ? 'companion--flying' : ''} ${activeFlight ? `companion--flight-${activeFlight}` : ''} ${suppressCompanion ? 'companion--ai-chat-open' : ''}`}
      dir="rtl"
    >
      {coachingToastMessage && !suppressCompanion && ctx === 'game' && (
        <div className="companion-coaching-toast" role="status" aria-live="polite">
          {adaptHebrewForGender(coachingToastMessage, effectiveGender, lang)}
        </div>
      )}
      {open && msg && !suppressCompanion && (
        <div
          key={`${ctx}-${idx}-${msg.title ?? msg.text}`}
          className='companion-message-cycle'
          style={{ animationDuration: `${msg.durationMs ?? readMs(msg.text)}ms` }}
        >
        <div className="companion-bubble" role="status" dir={msg.dir ?? 'rtl'}>
          <button className="companion-close" onClick={() => { setOpen(false); setDismissed(true); }} aria-label="סגור">×</button>
          {msg.title && <p className='companion-greet'>{msg.title}</p>}
          {msg.text && (
            <p className={msg.title ? 'companion-reason' : 'companion-greet'}>{msg.text}</p>
          )}
          {msg.cta && (
            <button className="companion-cta" onClick={activateMessageCta}>
              {msg.cta.label} ←
            </button>
          )}
          {msg.links && (
            <div className="companion-replies">
              {msg.links.map((link) => (
                <button
                  key={link.to}
                  className="companion-reply"
                  onClick={() => { setOpen(false); navigate(link.to); }}
                >
                  {link.label}
                </button>
              ))}
            </div>
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
          {msg.moodReplies && (
            <div className='companion-replies'>
              {msg.moodReplies.map((reply) => (
                <button
                  key={reply.value}
                  className='companion-reply'
                  onClick={() => selectMood(reply.value)}
                >
                  {reply.label}
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
      )}

      <button
        className="companion-char"
        onClick={handleAvatarActivation}
        aria-label={ctx === 'home' || ctx === 'games' ? 'Open AI assistant' : 'המאמן שלי'}
        title={ctx === 'home' || ctx === 'games' ? 'Open AI assistant' : 'המאמן שלי'}
      >
        {videoOk ? (
          <AvatarClip
            clip={clip}
            className="companion-video"
            onEnded={handleClipEnd}
            onFail={() => {
              const shouldOpenChat = openAfterLaunch.current;
              openAfterLaunch.current = false;
              setVideoOk(false);
              setFlight(null);
              if (shouldOpenChat) openChatAtAvatar();
            }}
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
