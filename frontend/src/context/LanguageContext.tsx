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

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
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

  // Cognitive problems (titles + descriptions)
  'problem.short-term-memory.title':  { he: 'זיכרון לטווח קצר',     en: 'Short-term Memory' },
  'problem.short-term-memory.desc':   { he: 'קושי לזכור מידע חדש שנאמר לפני רגע — שמות, מיקום של חפצים, רשימת קניות', en: 'Trouble remembering new information just heard — names, where things were placed, shopping lists' },
  'problem.attention.title':          { he: 'קשב וריכוז',           en: 'Attention & Focus' },
  'problem.attention.desc':           { he: 'קושי לשמור על קשב לאורך זמן או להתעלם מגירויים מסיחים בסביבה', en: 'Difficulty staying focused or filtering out distractions in the environment' },
  'problem.processing-speed.title':   { he: 'מהירות עיבוד',          en: 'Processing Speed' },
  'problem.processing-speed.desc':    { he: 'הזמן שלוקח לעבד מידע ולקבל החלטה — נוטה להאט עם הגיל', en: 'How quickly information is processed and decisions are made — tends to slow with age' },
  'problem.reaction-time.title':      { he: 'זמן תגובה',            en: 'Reaction Time' },
  'problem.reaction-time.desc':       { he: 'הזמן בין הגירוי לתגובה — חשוב להתמודדות מהירה עם שינויים בסביבה', en: 'The gap between stimulus and response — vital for reacting to a changing environment' },
  'problem.strategic-thinking.title': { he: 'חשיבה אסטרטגית',       en: 'Strategic Thinking' },
  'problem.strategic-thinking.desc':  { he: 'יכולת לתכנן צעדים קדימה, לחשב סיכונים ולקבל החלטות מורכבות', en: 'Planning steps ahead, weighing risk, and making complex decisions' },
  'problem.response-inhibition.title':{ he: 'עיכוב תגובה',          en: 'Response Inhibition' },
  'problem.response-inhibition.desc': { he: 'היכולת לעצור פעולה אוטומטית ולבחור באופן מודע — שליטה בדחפים', en: 'Holding back an automatic action to choose deliberately — impulse control' },

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

  const value = useMemo<LanguageContextValue>(() => ({
    lang,
    setLang: (l) => setLangState(l),
    toggle:  () => setLangState(prev => prev === 'he' ? 'en' : 'he'),
    t:       (key) => TRANSLATIONS[key][lang],
    dir:     lang === 'he' ? 'rtl' : 'ltr',
  }), [lang]);

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
