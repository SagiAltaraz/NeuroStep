/**
 * LanguageContext — single source of truth for the user-facing language.
 *
 * Resolution order on mount:
 *   1. Logged-in user's saved preference  (user.language from AuthContext)
 *   2. localStorage('lang')                (returning guest)
 *   3. Browser language fallback           (he if /^he/, else en)
 *
 * Switching language updates state + localStorage. The Header toggle calls
 * setLang(). When a user signs up or logs in, useLanguageSync() (called once
 * by App) hydrates the context from user.language so a returning user sees
 * their preferred language across devices.
 *
 * Adding a string: append a new key to the Translations type and provide
 * both translations in TRANSLATIONS below. TypeScript will surface every
 * call site that needs updating.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'he' | 'en';

const STORAGE_KEY = 'lang';

// ── Translation table ──────────────────────────────────────────────────────────

const TRANSLATIONS = {
  // Header
  'header.signup':       { he: 'הרשמה',           en: 'Sign Up' },
  'header.login':        { he: 'התחברות',         en: 'Log In' },
  'header.logout':       { he: 'יציאה',           en: 'Logout' },
  'header.welcome':      { he: 'שלום',            en: 'Hello' },
  'header.admin':        { he: 'מנהל',            en: 'Admin Panel' },
  'header.journey':      { he: 'המסע שלי',         en: 'My Journey' },
  'header.lang.toggle':  { he: 'EN',              en: 'עברית' },

  // Home page hero
  'home.cta.start':      { he: 'התחל אימון',      en: 'Start Training' },
  'home.cta.hint':       { he: 'הרשם כדי לעקוב אחר ההתקדמות', en: 'Sign up for personalized progress tracking' },
  'home.title':          { he: 'שמור על מוח חד',  en: 'Keep Your Mind Sharp' },
  'home.subtitle':       { he: 'אימון קוגניטיבי דרך משחקים מהנים שמותאמים למבוגרים', en: 'Cognitive training through engaging games designed for adults' },
  'home.feature.memory': { he: 'זיכרון',           en: 'Memory' },
  'home.feature.focus':  { he: 'קשב',              en: 'Focus' },
  'home.feature.speed':  { he: 'מהירות',           en: 'Speed' },

  // Problems carousel
  'problems.eyebrow':    { he: 'אתגרים קוגניטיביים נפוצים', en: 'Common Cognitive Challenges' },
  'problems.title':      { he: 'על מה אתה רוצה לעבוד היום?', en: 'What would you like to work on today?' },
  'problems.subtitle':   { he: 'בחר אתגר ונציג את המשחקים שמתאימים לאימון שלו', en: 'Pick a challenge — we\'ll show the games that train it' },
  'problems.cta':        { he: 'בחר משחק ←',      en: 'Choose a game →' },
  'problems.prev':       { he: 'הקודם',           en: 'Previous' },
  'problems.next':       { he: 'הבא',              en: 'Next' },

  // Cognitive problems (8 domains — titles + descriptions)
  'problem.working-memory.title':       { he: 'זיכרון עבודה',              en: 'Working Memory' },
  'problem.working-memory.desc':        { he: 'היכולת להחזיק מידע חדש בראש ולפעול לפיו — שמות, מיקומים, רשימות',
                                          en: 'Holding new information in mind and acting on it — names, locations, lists' },
  'problem.selective-attention.title':  { he: 'קשב סלקטיבי',               en: 'Selective Attention' },
  'problem.selective-attention.desc':   { he: 'להתמקד במה שחשוב ולסנן הסחות דעת מהסביבה',
                                          en: 'Focusing on what matters and filtering out distractions in the environment' },
  'problem.divided-attention.title':    { he: 'קשב מחולק',                 en: 'Divided Attention' },
  'problem.divided-attention.desc':     { he: 'לעקוב אחר כמה דברים במקביל ולעבור ביניהם בלי לאבד פוקוס',
                                          en: 'Tracking multiple things simultaneously and switching between them without losing focus' },
  'problem.processing-speed.title':     { he: 'מהירות עיבוד',              en: 'Processing Speed' },
  'problem.processing-speed.desc':      { he: 'הזמן שלוקח לעבד מידע ולקבל החלטה — נוטה להאט עם הגיל',
                                          en: 'How quickly information is processed and decisions are made — slows with age' },
  'problem.reaction-time.title':        { he: 'זמן תגובה',                en: 'Reaction Time' },
  'problem.reaction-time.desc':         { he: 'הזמן בין הגירוי לתגובה — חשוב להתמודדות מהירה עם שינויים בסביבה',
                                          en: 'The gap between stimulus and response — vital for reacting to a changing environment' },
  'problem.response-inhibition.title':  { he: 'עיכוב תגובה',              en: 'Response Inhibition' },
  'problem.response-inhibition.desc':   { he: 'לעצור פעולה אוטומטית ולבחור באופן מודע — שליטה בדחפים',
                                          en: 'Holding back an automatic action to choose deliberately — impulse control' },
  'problem.strategic-thinking.title':   { he: 'חשיבה אסטרטגית',           en: 'Strategic Thinking' },
  'problem.strategic-thinking.desc':    { he: 'לתכנן צעדים קדימה, לשקול סיכונים ולקבל החלטות מורכבות',
                                          en: 'Planning ahead, weighing risk, and making complex decisions' },
  'problem.visual-spatial.title':       { he: 'חשיבה חזותית-מרחבית',      en: 'Visual-Spatial Reasoning' },
  'problem.visual-spatial.desc':        { he: 'לזכור מיקומים, להבין יחסים מרחביים ולנווט בסביבה',
                                          en: 'Remembering positions, understanding spatial relationships, and navigating environments' },

  // Signup form
  'signup.title':        { he: 'יצירת חשבון',     en: 'Create an account' },
  'signup.subtitle':     { he: 'הזן את הפרטים שלך ליצירת החשבון', en: 'Enter your information below to create your account' },
  'signup.name':         { he: 'שם מלא',           en: 'Full Name' },
  'signup.email':        { he: 'אימייל',           en: 'Email' },
  'signup.email.hint':   { he: 'נשתמש בו לפניות אליך. לא נשתף אותו עם אף אחד.', en: "We'll use this to contact you. We will not share your email." },
  'signup.password':     { he: 'סיסמה',            en: 'Password' },
  'signup.password.hint':{ he: 'לפחות 8 תווים.',   en: 'Must be at least 8 characters long.' },
  'signup.confirm':      { he: 'אימות סיסמה',      en: 'Confirm Password' },
  'signup.confirm.hint': { he: 'אנא אמת את הסיסמה.', en: 'Please confirm your password.' },
  'signup.submit':       { he: 'צור חשבון',         en: 'Create Account' },
  'signup.submit.loading':{ he: 'יוצר חשבון...',   en: 'Creating Account...' },
  'signup.google':       { he: 'הרשם עם Google',    en: 'Sign up with Google' },
  'signup.have.account': { he: 'כבר יש לך חשבון?',  en: 'Already have an account?' },
  'signup.signin.link':  { he: 'התחבר',             en: 'Sign in' },
  'signup.or':           { he: 'או',                en: 'or' },
  'signup.lang.label':   { he: 'שפה מועדפת',       en: 'Preferred language' },
  'signup.lang.hint':    { he: 'בחר את שפת ברירת המחדל לחשבון שלך', en: 'Pick the default language for your account' },

  // Login form
  'login.title':         { he: 'התחברות לחשבון',   en: 'Login to your account' },
  'login.subtitle':      { he: 'הזן את האימייל להתחברות', en: 'Enter your email below to login' },
  'login.email':         { he: 'אימייל',           en: 'Email' },
  'login.password':      { he: 'סיסמה',            en: 'Password' },
  'login.submit':        { he: 'התחבר',             en: 'Login' },
  'login.submit.loading':{ he: 'מתחבר...',         en: 'Logging in...' },
  'login.google':        { he: 'התחבר עם Google',   en: 'Sign in with Google' },
  'login.no.account':    { he: 'אין לך חשבון?',     en: "Don't have an account?" },
  'login.signup.link':   { he: 'הרשמה',             en: 'Sign Up' },
  'login.or':            { he: 'או',                en: 'or' },

  // Games page
  'games.title':         { he: 'בחר משחק',         en: 'Choose a game' },
  'games.subtitle':      { he: 'כל משחק מתרגל יכולת קוגניטיבית שונה', en: 'Each game trains a different cognitive skill' },
  'games.title.filtered':{ he: 'משחקים ל',          en: 'Games for' },
  'games.subtitle.filtered':{ he: 'משחקים שמתאמנים על האתגר הזה', en: 'Games that train this challenge' },
  'games.show.all':      { he: '← הצג את כל המשחקים', en: '← Show all games' },
  'games.empty':         { he: 'בקרוב נוסיף משחק שמתאמן על',  en: 'A game training this is coming soon —' },
  'games.empty.cta':     { he: 'חזור לכל המשחקים',  en: 'Back to all games' },
  'games.play':          { he: 'שחק ←',             en: 'Play →' },
  'games.coming.soon':   { he: 'בקרוב',             en: 'Coming soon' },

  // New upcoming games (names + one-line descriptions)
  'game.greenLight.name':    { he: 'אור ירוק',                 en: 'Green Light' },
  'game.greenLight.desc':    { he: 'הקש כשהאור הופך לירוק — לא לפני!',  en: 'Tap the moment the light turns green — not a moment sooner!' },
  'game.spotDifference.name':{ he: 'מצא את ההבדל',             en: 'Spot the Difference' },
  'game.spotDifference.desc':{ he: 'אתר את הצורה השונה בין השאר במהירות',  en: 'Find the one shape that differs — as fast as you can' },
  'game.whereWasIt.name':    { he: 'איפה זה היה?',             en: 'Where Was It?' },
  'game.whereWasIt.desc':    { he: 'זכור היכן נדלקו המשבצות והקש עליהן',   en: 'Remember which squares lit up — then tap them' },
  'game.findLetter.name':    { he: 'מצא את האות',              en: 'Find the Letter' },
  'game.findLetter.desc':    { he: 'אתר את כל המופעים של האות בזמן הקצוב',  en: 'Find every instance of the letter before time runs out' },

  // Cognitive-area labels used in game instructions + game cards
  'training.primary':   { he: 'יכולת עיקרית',  en: 'Primary skill' },
  'training.secondary': { he: 'גם מאמן',        en: 'Also trains' },
  'training.what.trains': { he: 'על מה המשחק הזה מאמן',  en: 'What this game trains' },

  // Generic instruction-screen labels
  'inst.back':           { he: 'חזור',                 en: 'Back' },
  'inst.start':          { he: 'התחל משחק',           en: 'Start game' },
  'inst.rules.heading':  { he: 'הוראות המשחק',        en: 'How to play' },
  'inst.tips.heading':   { he: 'טיפים להצלחה',        en: 'Tips for success' },

  // End-of-session results overlay
  'results.finish':         { he: 'סיום אימון',              en: 'Finish session' },
  'results.summarizing':    { he: 'מסכמים את האימון…',       en: 'Wrapping up your session…' },
  'results.computing':      { he: 'מחשבים דוח מפורט…',       en: 'Preparing your detailed report…' },
  'results.unavailable':    { he: 'התוצאות לא נטענו כעת, אך האימון נשמר', en: "Results couldn't load right now, but your session was saved" },
  'results.title':          { he: 'סיכום האימון',            en: 'Session summary' },
  'results.score':          { he: 'ציון קוגניטיבי',          en: 'Cognitive score' },
  'results.accuracy':       { he: 'דיוק',                    en: 'Accuracy' },
  'results.reaction':       { he: 'זמן תגובה ממוצע',         en: 'Avg. reaction' },
  'results.streak':         { he: 'רצף שיא',                 en: 'Best streak' },
  'results.duration':       { he: 'משך',                     en: 'Duration' },
  'results.ms':             { he: 'מ״ש',                     en: 'ms' },
  'results.sec':            { he: 'שנ׳',                     en: 'sec' },
  'results.difficulty':     { he: 'רמת קושי',               en: 'Difficulty' },
  'results.strengths':      { he: 'חוזקות',                  en: 'Strengths' },
  'results.recommendations':{ he: 'המלצות',                  en: 'Recommendations' },
  'results.back':           { he: 'חזרה למשחקים',            en: 'Back to games' },
  'results.levelup':        { he: 'עלית רמה!',               en: 'Level up!' },
  'results.rank':           { he: 'דרגה',                    en: 'Rank' },
  'results.level':          { he: 'רמה',                     en: 'Level' },
  'results.progressed':     { he: 'התקדמת ב־',               en: 'Progressed in' },

  // Journey-map ranks
  'rank.beginner':  { he: 'מתחיל',  en: 'Beginner' },
  'rank.explorer':  { he: 'חוקר',   en: 'Explorer' },
  'rank.advanced':  { he: 'מתקדם',  en: 'Advanced' },
  'rank.expert':    { he: 'מומחה',  en: 'Expert' },
  'rank.champion':  { he: 'אלוף',   en: 'Champion' },

  // Journey map page
  'journey.title':    { he: 'מסע ההתקדמות',              en: 'Your journey' },
  'journey.subtitle': { he: 'כל אזור מאמן יכולת קוגניטיבית אחרת', en: 'Each region trains a different cognitive skill' },
  'journey.loading':  { he: 'טוען את המפה…',             en: 'Loading your map…' },
  'journey.error':    { he: 'לא הצלחנו לטעון את המפה',    en: "Couldn't load your map" },
  'journey.retry':    { he: 'נסה שוב',                   en: 'Try again' },
  'journey.overall':  { he: 'רמה כוללת',                 en: 'Overall level' },
  'journey.node':     { he: 'שלב',                       en: 'Stage' },
  'journey.of':       { he: 'מתוך',                      en: 'of' },
  'journey.you':      { he: 'אתה כאן',                   en: 'You are here' },
  'journey.play':     { he: 'אימון',                     en: 'Train' },
  'journey.avatar.plan.focus':    { he: 'מוקד התוכנית', en: 'Plan focus' },
  'journey.avatar.plan.sessions': { he: 'אימונים השבוע', en: 'sessions this week' },
  'journey.avatar.plan.pending':  {
    he: 'עדיין אין מספיק נתוני אימון לבניית תוכנית אישית.',
    en: 'There is not enough training data to build a personalized plan yet.',
  },

  // Contextual companion suggestions
  'companion.home.openAssistant': {
    he: 'אפשר ללחוץ עליי כדי לפתוח את עוזר ה-AI.',
    en: 'Activate me to open the AI assistant.',
  },
  'companion.home.startTraining': {
    he: 'אפשר להתחיל באימון זמין כבר עכשיו.',
    en: 'You can start an available training activity now.',
  },
  'companion.games.select': {
    he: 'בחר משחק שמתאים למה שתרצה לתרגל היום.',
    en: 'Choose a game for what you would like to practice today.',
  },
  'companion.recommended': { he: 'ההמלצה הנוכחית שלך:', en: 'Your current recommendation:' },
  'companion.play':        { he: 'התחל',                 en: 'Start' },
  // Structured companion suggestions
  'companion.suggestion.plan-game': {
    he: 'תוכנית האימון הנוכחית שלך כוללת את {game}.',
    en: 'Your current training plan includes {game}.',
  },
  'companion.suggestion.open-assistant': {
    he: 'אפשר לפתוח את עוזר ה-AI כדי לשאול שאלה.',
    en: 'You can open the AI assistant to ask a question.',
  },
  'companion.suggestion.browse-games': {
    he: 'אפשר לעיין במשחקים הזמינים ולבחור פעילות.',
    en: 'Browse the available games and choose an activity.',
  },
  'companion.suggestion.recorded-level': {
    he: 'הרמה המתועדת שלך במסע היא {level}.',
    en: 'Your recorded journey level is {level}.',
  },
  'companion.suggestion.journey-map': {
    he: 'אפשר לעיין במפת המסע או לבחור פעילות אימון.',
    en: 'View your journey map or choose a training activity.',
  },
  'companion.suggestion.weekly-plan': {
    he: 'התוכנית השבועית שלך כוללת {sessionsPerWeek} אימונים ב{game}.',
    en: 'Your weekly plan includes {sessionsPerWeek} sessions of {game}.',
  },
  'companion.suggestion.next-activity': {
    he: 'הפעילות הבאה שמוצעת לך היא {game}.',
    en: 'Your next suggested activity is {game}.',
  },
  'companion.action.start-game': {
    he: 'התחל את {game}',
    en: 'Start {game}',
  },
  'companion.action.open-assistant': {
    he: 'פתח את עוזר ה-AI',
    en: 'Open AI assistant',
  },
  'companion.action.browse-games': {
    he: 'עיין במשחקים',
    en: 'Browse games',
  },
  // Cognitive-domain trend
  'trend.up':     { he: 'עולה',  en: 'Improving' },
  'trend.stable': { he: 'יציב',  en: 'Steady' },
  'trend.down':   { he: 'יורד',  en: 'Declining' },
} as const;

export type TKey = keyof typeof TRANSLATIONS;

// ── Browser-language fallback ──────────────────────────────────────────────────

function detectBrowserLang(): Lang {
  if (typeof navigator === 'undefined') return 'he';
  return /^he/i.test(navigator.language) ? 'he' : 'en';
}

function readInitialLang(): Lang {
  if (typeof window === 'undefined') return 'he';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'he' || stored === 'en') return stored;
  return detectBrowserLang();
}

// ── Context ────────────────────────────────────────────────────────────────────

interface LanguageContextValue {
  lang:    Lang;
  setLang: (l: Lang) => void;
  toggle:  () => void;
  t:       (key: TKey) => string;
  dir:     'rtl' | 'ltr';
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  // Persist + sync html attributes whenever the language changes.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr';
  }, [lang]);

  // Stable identities across language changes: consumers depend on these in
  // effects (e.g. AuthContext syncing the saved preference). If they were
  // recreated on every render, a toggle would re-fire those effects and clobber
  // the user's fresh choice back to the saved default.
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggle  = useCallback(() => setLangState(prev => (prev === 'he' ? 'en' : 'he')), []);

  const value = useMemo<LanguageContextValue>(() => ({
    lang,
    setLang,
    toggle,
    t:   (key) => TRANSLATIONS[key][lang],
    dir: lang === 'he' ? 'rtl' : 'ltr',
  }), [lang, setLang, toggle]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within <LanguageProvider>');
  return ctx;
}
