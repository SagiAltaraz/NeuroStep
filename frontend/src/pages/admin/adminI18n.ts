/**
 * adminI18n — translations for the admin panel.
 *
 * Kept out of context/LanguageContext.tsx on purpose: every admin page is
 * lazy-loaded (see App.tsx), and LanguageContext ships in the main bundle —
 * folding ~200 admin-only strings into it would push admin copy to every
 * visitor. This module is imported only by admin pages, so it rides along in
 * the admin chunk. Same split rationale as data/gameLabels.ts.
 *
 * Usage:
 *   const { t, lang, dir, locale, gameLabel } = useAdminT();
 *   <h1>{t('pf.title')}</h1>
 */
import { useCallback, useMemo } from 'react';
import { useLang } from '../../context/LanguageContext';

type Str = { he: string; en: string };

// ── Strings ───────────────────────────────────────────────────────────────────

const S = {
  // Common
  'common.back':      { he: 'חזור',            en: 'Back' },
  'common.backArrow': { he: 'חזרה',            en: 'Back' },
  'common.retry':     { he: 'נסה שוב',         en: 'Try again' },
  'common.loading':   { he: 'טוען נתונים…',    en: 'Loading…' },
  'common.loadError': { he: 'שגיאה בטעינה',    en: 'Failed to load' },
  'common.notAuth':   { he: 'לא מחובר',        en: 'Not authenticated' },
  'common.error':     { he: 'שגיאה',           en: 'Error' },
  'common.admin':     { he: 'מנהל',            en: 'Admin' },
  'common.user':      { he: 'משתמש',           en: 'User' },
  'common.accuracy':  { he: 'דיוק',            en: 'Accuracy' },
  'common.score':     { he: 'ציון',            en: 'Score' },
  'common.date':      { he: 'תאריך',           en: 'Date' },
  'common.game':      { he: 'משחק',            en: 'Game' },
  'common.all':       { he: 'הכול',            en: 'All' },
  'common.backendHint': {
    he: 'ודא ש-backend/server.js רץ (port 3000)',
    en: 'Make sure backend/server.js is running (port 3000)',
  },

  // Game names — mirror the cards on GamesPage so the panel matches the app.
  'game.color-trains':    { he: 'רכבות הצבעים',  en: 'Color Trains' },
  'game.tictactoe':       { he: 'איקס עיגול',    en: 'Tic-Tac-Toe' },
  'game.memory':          { he: 'משחק זיכרון',   en: 'Memory Match' },
  'game.shapes-click':    { he: 'צורות שקופצות', en: 'Pop the Circles' },
  'game.green-light':     { he: 'אור ירוק',      en: 'Green Light' },
  'game.spot-difference': { he: 'מצא את ההבדל',  en: 'Spot the Difference' },
  'game.where-was-it':    { he: 'איפה זה היה?',  en: 'Where Was It?' },
  'game.find-letter':     { he: 'מצא את האות',   en: 'Find the Letter' },

  // Cognitive domains
  'domain.working-memory':      { he: 'זיכרון עבודה',          en: 'Working Memory' },
  'domain.selective-attention': { he: 'קשב סלקטיבי',           en: 'Selective Attention' },
  'domain.divided-attention':   { he: 'קשב מחולק',             en: 'Divided Attention' },
  'domain.processing-speed':    { he: 'מהירות עיבוד',          en: 'Processing Speed' },
  'domain.reaction-time':       { he: 'זמן תגובה',             en: 'Reaction Time' },
  'domain.response-inhibition': { he: 'עיכוב תגובה',           en: 'Response Inhibition' },
  'domain.strategic-thinking':  { he: 'חשיבה אסטרטגית',        en: 'Strategic Thinking' },
  'domain.visual-spatial':      { he: 'חשיבה חזותית-מרחבית',   en: 'Visual-Spatial' },

  // Short domain labels — keep the radar axis legible.
  'domainShort.working-memory':      { he: 'זיכרון',       en: 'Memory' },
  'domainShort.selective-attention': { he: 'קשב סלקטיבי',  en: 'Selective' },
  'domainShort.divided-attention':   { he: 'קשב מחולק',    en: 'Divided' },
  'domainShort.processing-speed':    { he: 'מהירות',       en: 'Speed' },
  'domainShort.reaction-time':       { he: 'תגובה',        en: 'Reaction' },
  'domainShort.response-inhibition': { he: 'עיכוב',        en: 'Inhibition' },
  'domainShort.strategic-thinking':  { he: 'אסטרטגיה',     en: 'Strategy' },
  'domainShort.visual-spatial':      { he: 'מרחבי',        en: 'Spatial' },

  // Ranks
  'rank.beginner':     { he: 'מתחיל',  en: 'Beginner' },
  'rank.intermediate': { he: 'מתקדם',  en: 'Intermediate' },
  'rank.advanced':     { he: 'מומחה',  en: 'Advanced' },
  'rank.expert':       { he: 'אלוף',   en: 'Expert' },

  // Coach-report progress
  'progress.improving':       { he: 'התקדמות',        en: 'Improving' },
  'progress.stable':          { he: 'יציב',           en: 'Stable' },
  'progress.needs_attention': { he: 'דורש תשומת לב',  en: 'Needs attention' },

  // Difficulty direction
  'netdir.harder': { he: 'הוקשה',  en: 'Harder' },
  'netdir.easier': { he: 'הוקלה',  en: 'Easier' },
  'netdir.stable': { he: 'יציבה',  en: 'Stable' },

  // Training-plan priority buckets (mirror backend/services/trainingPlan.js)
  'priority.high':   { he: 'גבוהה',   en: 'High' },
  'priority.medium': { he: 'בינונית', en: 'Medium' },
  'priority.low':    { he: 'תחזוקה',  en: 'Maintenance' },

  // Training-plan reasons. The backend only ships `reasonHe`, so English is
  // rebuilt client-side from the structured fields (level / trend /
  // deterioration) using the same branches as reasonHe() on the server.
  // `$d` = domain, `$g` = game.
  'reason.decline':  {
    he: 'זוהתה ירידה ב$d — חיזוק ממוקד ב"$g".',
    en: 'A decline was detected in $d — focused practice in "$g".',
  },
  'reason.trendDown': {
    he: '$d במגמת ירידה — כדאי לתרגל ב"$g".',
    en: '$d is trending down — worth practising with "$g".',
  },
  'reason.weak': {
    he: '$d עדיין חלש — התמקדות ב"$g".',
    en: '$d is still weak — focus on "$g".',
  },
  'reason.moderate': {
    he: '$d ברמה בינונית — תרגול קבוע ב"$g".',
    en: '$d is at a moderate level — regular practice with "$g".',
  },
  'reason.strong': {
    he: '$d חזק — תחזוקה קלה ב"$g".',
    en: '$d is strong — light maintenance with "$g".',
  },

  // ── Cognitive trend page ────────────────────────────────────────────────────
  'tp.title':        { he: 'מגמת ציון קוגניטיבי', en: 'Cognitive Score Trend' },
  'tp.loadError':    { he: 'לא הצלחנו לטעון את הנתונים', en: "Couldn't load the data" },
  'tp.filterGame':   { he: 'משחק',   en: 'Game' },
  'tp.filterPeriod': { he: 'תקופה',  en: 'Period' },
  'tp.periodPick':   { he: 'בחירת תקופה', en: 'Select period' },
  'tp.period.7d':    { he: '7 ימים',  en: '7 days' },
  'tp.period.30d':   { he: '30 ימים', en: '30 days' },
  'tp.period.90d':   { he: '90 ימים', en: '90 days' },
  'tp.period.all':   { he: 'הכול',    en: 'All time' },
  'tp.emptyTitle':   { he: 'עדיין אין דאטה', en: 'No data yet' },
  'tp.emptyBody':    { he: 'שחקו כמה משחקים והדוחות יופיעו כאן', en: 'Play a few games and reports will appear here' },
  'tp.latestScore':  { he: 'ציון אחרון',    en: 'Latest score' },
  'tp.periodAvg':    { he: 'ממוצע בתקופה',  en: 'Period average' },
  'tp.change':       { he: 'שינוי',         en: 'Change' },
  'tp.sessions':     { he: 'מספר משחקים',   en: 'Sessions' },
  'tp.chartTitle':   { he: 'ציון קוגניטיבי לאורך זמן', en: 'Cognitive score over time' },
  'tp.chartSub':     {
    he: 'סולם 0–100 · קו 40 = ממוצע · קו 70 = ביצועים חזקים',
    en: 'Scale 0–100 · line at 40 = average · line at 70 = strong',
  },
  'tp.tableCaption': { he: 'טבלה זמינה לקוראי מסך — נתוני הגרף לעיל', en: 'Screen-reader table — data from the chart above' },
  'tp.recent':       { he: 'משחקים אחרונים', en: 'Recent sessions' },
  'tp.showMore':     { he: 'הצג עוד', en: 'Show more' },
  'tp.showLess':     { he: 'כווץ',    en: 'Show less' },

  // ── Coach reports page ──────────────────────────────────────────────────────
  'cr.title':      { he: 'דוחות התקדמות', en: 'Progress Reports' },
  'cr.loading':    { he: 'טוען דוחות…',   en: 'Loading reports…' },
  'cr.loadError':  { he: 'לא הצלחנו לטעון את הדוחות', en: "Couldn't load the reports" },
  'cr.emptyTitle': { he: 'עדיין לא הופקו דוחות', en: 'No reports yet' },
  'cr.emptyBody':  {
    he: 'דרושים לפחות 5 משחקים מאותו סוג כדי להפיק דוח התקדמות',
    en: 'At least 5 sessions of the same game are needed to generate a progress report',
  },
  'cr.filterByGame': { he: 'סינון לפי משחק', en: 'Filter by game' },
  'cr.showDetails':  { he: '▼ הצג פרטים',   en: '▼ Show details' },
  'cr.hideDetails':  { he: '▲ הסתר פרטים',  en: '▲ Hide details' },
  'cr.highlights':   { he: 'נקודות חוזק',   en: 'Highlights' },
  'cr.recommendations': { he: 'המלצות',     en: 'Recommendations' },
  'cr.insight':      { he: 'תובנה קוגניטיבית', en: 'Cognitive insight' },
  'cr.basedOn':      { he: 'מבוסס על $ משחקים שנערכו עד כה', en: 'Based on $ sessions so far' },

  // ── Player file page ────────────────────────────────────────────────────────
  'pf.title':       { he: 'תיק שחקן', en: 'Player File' },
  'pf.loadError':   { he: 'לא הצלחנו לטעון את התיק', en: "Couldn't load the player file" },
  'pf.joined':      { he: 'הצטרף',           en: 'Joined' },
  'pf.overallLevel': { he: 'רמה כללית',      en: 'Overall level' },
  'pf.rank':        { he: 'דרגה',            en: 'Rank' },
  'pf.recentGames': { he: 'משחקים אחרונים',  en: 'Recent sessions' },
  'pf.linkTrend':   { he: 'מגמה קוגניטיבית', en: 'Cognitive trend' },
  'pf.linkReports': { he: 'דוחות מאמן',      en: 'Coach reports' },
  'pf.profile':     { he: 'פרופיל קוגניטיבי', en: 'Cognitive Profile' },
  'pf.profileEmpty': {
    he: 'עדיין אין פרופיל — המשתמש טרם השלים משחקים.',
    en: 'No profile yet — this user has not completed any sessions.',
  },
  'pf.level':       { he: 'רמה',   en: 'Level' },
  'pf.trendTitle':  { he: 'מגמה',  en: 'Trend' },
  'pf.plan':        { he: 'תוכנית אימונים שבועית', en: 'Weekly Training Plan' },
  'pf.planPerWeek': { he: 'משחקים/שבוע',  en: 'sessions/week' },
  'pf.planFocus':   { he: 'דגש',          en: 'Focus' },
  'pf.planSub':     {
    he: 'נגזרת מהפרופיל — דומיינים חלשים או במגמת ירידה מקבלים עדיפות ותדירות גבוהה יותר.',
    en: 'Derived from the profile — weaker or declining domains get higher priority and frequency.',
  },
  'pf.planWeekly':  { he: 'בשבוע', en: '/week' },
  'pf.scoreTrend':  { he: 'מגמת ציון קוגניטיבי', en: 'Cognitive Score Trend' },
  'pf.scoreTrendSub': {
    he: 'משחקים אחרונים · סולם 0–100 · 40 = ממוצע · 70 = חזק',
    en: 'Recent sessions · scale 0–100 · 40 = average · 70 = strong',
  },
  'pf.openAlerts':  { he: 'התראות פתוחות', en: 'Open Alerts' },
  'pf.history':     { he: 'היסטוריית משחקים', en: 'Session History' },
  'pf.historyEmpty': { he: 'אין עדיין משחקים.', en: 'No sessions yet.' },
  'pf.openReport':  { he: 'פתח דוח ל',  en: 'Open report for ' },
  'pf.reportTitle': { he: 'דוח סשן',    en: 'Session Report' },
  'pf.close':       { he: 'סגור',       en: 'Close' },
  'pf.reportLoading': { he: 'טוען דוח…', en: 'Loading report…' },
  'pf.reportError': { he: 'שגיאה בטעינת הדוח', en: 'Failed to load the report' },
  'pf.domainScores': { he: 'ציוני דומיינים', en: 'Domain scores' },
  'pf.strengths':   { he: 'חוזקות',   en: 'Strengths' },
  'pf.recommendations': { he: 'המלצות', en: 'Recommendations' },
  'pf.rawStats':    { he: 'נתונים גולמיים', en: 'Raw stats' },
  'pf.reactionTime': { he: 'זמן תגובה',  en: 'Reaction time' },
  'pf.peakStreak':  { he: 'רצף שיא',     en: 'Peak streak' },
  'pf.duration':    { he: 'משך',         en: 'Duration' },
  'pf.adjustments': { he: 'התאמות קושי', en: 'Difficulty adjustments' },
  'pf.difficultyTrend': { he: 'מגמת קושי', en: 'Difficulty trend' },
  'pf.alertAccuracy':  { he: 'ירידה בדיוק',              en: 'Accuracy drop' },
  'pf.alertPoints':    { he: 'נק׳',                      en: 'pts' },
  'pf.alertScore':     { he: 'ירידה בציון הקוגניטיבי',   en: 'Cognitive score decline' },
  'pf.alertPattern':   { he: 'דפוס ירידה זוהה',          en: 'Decline pattern detected' },

  // ── Alerts page ─────────────────────────────────────────────────────────────
  'al.title':    { he: 'אזעקות פעילות', en: 'Active Alerts' },
  'al.subtitle': {
    he: 'התרעות על דפוסי ירידה בביצועים — לבדיקה על־ידי המטפל',
    en: 'Alerts on declining performance patterns — for the caregiver to review',
  },
  'al.loading':    { he: 'טוען אזעקות…', en: 'Loading alerts…' },
  'al.loadError':  { he: 'לא הצלחנו לטעון את האזעקות', en: "Couldn't load the alerts" },
  'al.emptyTitle': { he: 'אין אזעקות ממתינות', en: 'No pending alerts' },
  'al.emptyBody':  {
    he: 'כל המטופלים שומרים על ביצועים יציבים — אין צורך בפעולה כרגע',
    en: 'Everyone is performing steadily — nothing needs attention right now',
  },
  'al.cfgTitle': { he: 'ספי רגישות להתראה', en: 'Alert sensitivity thresholds' },
  'al.cfgSubA':  { he: 'התראה נפתחת כשמזוהה ירידה על פני', en: 'An alert opens when a decline is detected across' },
  'al.cfgSubB':  { he: 'משחקים רצופים ומעבר לספים הבאים.', en: 'consecutive sessions and beyond the thresholds below.' },
  'al.cfgAccuracy': { he: 'ירידה בדיוק (נק׳ אחוז)', en: 'Accuracy drop (percentage points)' },
  'al.cfgScore':    { he: 'ירידה בציון קוגניטיבי',  en: 'Cognitive score drop' },
  'al.cfgSave':     { he: 'שמור ספים',  en: 'Save thresholds' },
  'al.cfgSaving':   { he: 'שומר…',      en: 'Saving…' },
  'al.cfgSaved':    { he: '✓ נשמר',     en: '✓ Saved' },
  'al.cfgFailed':   { he: 'השמירה נכשלה', en: 'Save failed' },
  'al.viewTrend':   { he: 'הצג מגמת ציון', en: 'View score trend' },
  'al.details':     { he: 'צפה בפרטים',    en: 'View details' },
  'al.acknowledge': { he: 'אישור',         en: 'Acknowledge' },
  'al.ackFailed':   { he: 'הפעולה נכשלה — נסה שוב', en: 'Action failed — try again' },
  'al.trigAccuracyA': { he: 'ירידה של',  en: 'A drop of' },
  'al.trigAccuracyB': { he: 'נקודות באחוזי דיוק לאורך 3 משחקים', en: 'accuracy points across 3 sessions' },
  'al.trigScore':     { he: 'ציון קוגניטיבי ירד בעקביות לאורך 3 משחקים', en: 'Cognitive score declined consistently across 3 sessions' },
  'al.trigPattern':   { he: 'דפוס ירידה זוהה לאורך 3 משחקים', en: 'Decline pattern detected across 3 sessions' },
  'al.justNow':  { he: 'לפני רגע', en: 'just now' },
  'al.agoMin':   { he: 'לפני $ דקות', en: '$ min ago' },
  'al.agoHour':  { he: 'לפני שעה',    en: 'an hour ago' },
  'al.agoHours': { he: 'לפני $ שעות', en: '$ hours ago' },
  'al.agoDay':   { he: 'לפני יום',    en: 'a day ago' },
  'al.agoDays':  { he: 'לפני $ ימים', en: '$ days ago' },

  // ── Stats view ──────────────────────────────────────────────────────────────
  'st.loading':   { he: 'טוען נתונים מ-Firestore…', en: 'Loading data from Firestore…' },
  'st.errorTitle': { he: 'שגיאת טעינה:', en: 'Load error:' },
  'st.errorHint': {
    he: 'בדוק שה-backend פעיל ושיש לך הרשאות admin',
    en: 'Check that the backend is running and that you have admin access',
  },
  'st.sessions':   { he: 'סשנים',                en: 'Sessions' },
  'st.uniqueUsers': { he: 'משתמשים ייחודיים',    en: 'Unique users' },
  'st.avgAccuracy': { he: 'דיוק ממוצע',          en: 'Avg. accuracy' },
  'st.avgScore':   { he: 'ציון קוגניטיבי ממוצע', en: 'Avg. cognitive score' },
  'st.accByGame':  { he: 'דיוק לפי משחק',        en: 'Accuracy by game' },
  'st.noData':     { he: 'אין נתונים עדיין',     en: 'No data yet' },
  'st.scoreOverTime': { he: 'ציון קוגניטיבי לאורך זמן', en: 'Cognitive score over time' },
  'st.noReportsPlay': { he: 'עדיין אין דוחות — שחק כדי ליצור', en: 'No reports yet — play to generate one' },
  'st.session':    { he: 'סשן', en: 'Session' },
  'st.claudeUsage': { he: 'שימוש ב-Claude API', en: 'Claude API usage' },
  'st.reportsGenerated': { he: 'דוחות שנוצרו',  en: 'Reports generated' },
  'st.estCost':    { he: 'עלות משוערת (Haiku)', en: 'Est. cost (Haiku)' },
  'st.noUsage':    {
    he: 'אין שימוש עדיין — דוחות נוצרים בסוף כל סשן',
    en: 'No usage yet — reports are generated at the end of each session',
  },
  'st.recentReports': { he: 'דוחות קוגניטיביים אחרונים', en: 'Recent cognitive reports' },
  'st.noReports':  { he: 'עדיין אין דוחות', en: 'No reports yet' },

  // Per-game success breakdown (section 1)
  'sg.title':     { he: 'הצלחה לפי משחק', en: 'Success by game' },
  'sg.sub':       {
    he: 'אחוזי הצלחה, זמן תגובה וציון קוגניטיבי לכל משחק — לחיצה על "דוח" מורידה CSV מפורט.',
    en: 'Success rate, reaction time and cognitive score per game — “Report” downloads a detailed CSV.',
  },
  'sg.game':      { he: 'משחק',      en: 'Game' },
  'sg.sessions':  { he: 'סשנים',     en: 'Sessions' },
  'sg.users':     { he: 'משתמשים',   en: 'Users' },
  'sg.accuracy':  { he: 'דיוק',      en: 'Accuracy' },
  'sg.reaction':  { he: 'תגובה (ms)', en: 'RT (ms)' },
  'sg.score':     { he: 'ציון',      en: 'Score' },
  'sg.report':    { he: '⬇ דוח',    en: '⬇ Report' },
  'sg.reportAll': { he: '⬇ דוח פר-משחק', en: '⬇ Per-game report' },
  'sg.empty':     { he: 'אין נתונים עדיין', en: 'No data yet' },

  // ── Compare users (section 2) ───────────────────────────────────────────────
  'cmp.title':    { he: 'השוואת משתמשים', en: 'Compare users' },
  'cmp.sub':      {
    he: 'השווה שני משתמשים, או קבוצות גיל/מגדר זו מול זו — במשחק מסוים או בכל המשחקים.',
    en: 'Compare two users, or age/gender groups against each other — for one game or across all.',
  },
  'cmp.mode.users':  { he: '👥 משתמש מול משתמש', en: '👥 User vs user' },
  'cmp.mode.groups': { he: '🎯 קבוצה מול קבוצה', en: '🎯 Group vs group' },
  'cmp.userA':    { he: 'משתמש א׳', en: 'User A' },
  'cmp.userB':    { he: 'משתמש ב׳', en: 'User B' },
  'cmp.selectGroups': { he: 'קבוצות להשוואה:', en: 'Groups to compare:' },
  'cmp.addGroup': { he: 'הוסף קבוצה', en: 'Add group' },
  'cmp.remove':   { he: 'הסר', en: 'Remove' },
  'cmp.noDemo':   { he: 'ללא נתוני גיל/מגדר', en: 'No age/gender data' },
  'cmp.byGame':   { he: 'לפי משחק', en: 'By game' },
  'cmp.overTime': { he: 'לאורך זמן (שיפור ושימור)', en: 'Over time (improvement & retention)' },
  'cmp.radarTitle': { he: 'פרופיל כולל (רדאר)', en: 'Overall profile (radar)' },
  'cmp.overall':  { he: 'כולל', en: 'Overall' },
  'cmp.lowerBetter': { he: 'נמוך יותר = טוב יותר', en: 'Lower is better' },
  'cmp.needUsers': { he: 'צריך לפחות שני משתמשים עם נתונים כדי להשוות', en: 'Need at least two users with data to compare' },
  'cmp.game':     { he: 'משחק', en: 'Game' },
  'cmp.allGames': { he: 'כל המשחקים', en: 'All games' },
  'cmp.dim':      { he: 'משווים לפי', en: 'Compare by' },
  'cmp.dim.gender': { he: 'מגדר', en: 'Gender' },
  'cmp.dim.age':    { he: 'קבוצת גיל', en: 'Age group' },
  'cmp.metric':   { he: 'מדד', en: 'Metric' },
  'cmp.metric.accuracy': { he: 'דיוק', en: 'Accuracy' },
  'cmp.metric.score':    { he: 'ציון קוגניטיבי', en: 'Cognitive score' },
  'cmp.metric.reaction': { he: 'זמן תגובה (ms)', en: 'Reaction (ms)' },
  'cmp.group':    { he: 'קבוצה', en: 'Group' },
  'cmp.value':    { he: 'ערך', en: 'Value' },
  'cmp.sessions': { he: 'סשנים', en: 'Sessions' },
  'cmp.users':    { he: 'משתמשים', en: 'Users' },
  'cmp.report':   { he: '⬇ דוח השוואה', en: '⬇ Comparison report' },
  'cmp.empty':    { he: 'אין מספיק נתונים דמוגרפיים עדיין (נאספים בשאלון ההרשמה)', en: 'Not enough demographic data yet (collected in the onboarding questionnaire)' },
  'cmp.unknown':  { he: 'לא ידוע', en: 'Unknown' },
  // demographic bucket labels (ids come from the onboarding questionnaire)
  'age.under-50': { he: 'מתחת ל-50', en: 'Under 50' },
  'age.50-60':    { he: '50–60', en: '50–60' },
  'age.61-70':    { he: '61–70', en: '61–70' },
  'age.71-80':    { he: '71–80', en: '71–80' },
  'age.over-80':  { he: 'מעל 80', en: 'Over 80' },
  'gender.male':   { he: 'זכר', en: 'Male' },
  'gender.female': { he: 'נקבה', en: 'Female' },
  'gender.other-undisclosed': { he: 'אחר / לא צוין', en: 'Other / N/A' },

  // ── Events view ─────────────────────────────────────────────────────────────
  'ev.title':      { he: 'סשני משחק',    en: 'Game Sessions' },
  'ev.allGames':   { he: 'כל המשחקים',   en: 'All games' },
  'ev.countLabel': { he: 'סשנים',        en: 'sessions' },
  'ev.loading':    { he: 'טוען…',        en: 'Loading…' },
  'ev.empty':      { he: 'אין סשנים עדיין — שחק משחק כלשהו', en: 'No sessions yet — play a game' },
  'ev.user':       { he: 'משתמש',        en: 'User' },
  'ev.duration':   { he: 'משך',          en: 'Duration' },
  'ev.avgRt':      { he: 'RT ממוצע',     en: 'Avg. RT' },
  'ev.peakStreak': { he: 'שיא רצף',      en: 'Peak streak' },
  'ev.claudeScore': { he: 'ציון Claude', en: 'Claude score' },
  'ev.secShort':   { he: "ש'",           en: 's' },
  'ev.minShort':   { he: "ד'",           en: 'm' },

  // ── Activity view ───────────────────────────────────────────────────────────
  'ac.title':       { he: 'פעילות משתמשים', en: 'User Activity' },
  'ac.loading':     { he: 'טוען…',          en: 'Loading…' },
  'ac.activeUsers': { he: 'משתמשים פעילים', en: 'Active users' },
  'ac.noActivity':  { he: 'אין פעילות עדיין', en: 'No activity yet' },
  'ac.lastLogin':   { he: 'כניסה אחרונה',   en: 'Last login' },
  'ac.logins':      { he: 'כניסות',         en: 'logins' },
  'ac.loginLog':    { he: 'יומן כניסות',    en: 'Login log' },
  'ac.noRecords':   { he: 'אין רשומות',     en: 'No records' },
  'ac.agoNow':      { he: 'לפני רגע',       en: 'just now' },
  'ac.agoMin':      { he: "לפני $ דק'",     en: '$ min ago' },
  'ac.agoHour':     { he: "לפני $ שע'",     en: '$ hr ago' },
  'ac.agoDay':      { he: 'לפני $ ימים',    en: '$ days ago' },

  // ── Trends user list ────────────────────────────────────────────────────────
  'tl.title':    { he: 'מגמות קוגניטיביות', en: 'Cognitive Trends' },
  'tl.subtitle': { he: 'בחרו משתמש כדי לראות את המגמה הקוגניטיבית שלו', en: 'Pick a user to view their cognitive trend' },
  'tl.search':   { he: 'חיפוש לפי שם או אימייל…', en: 'Search by name or email…' },
  'tl.loading':  { he: 'טוען משתמשים…',  en: 'Loading users…' },
  'tl.empty':    { he: 'לא נמצאו משתמשים', en: 'No users found' },
  'tl.viewFor':  { he: 'צפה במגמה של',   en: 'View trend for' },
} satisfies Record<string, Str>;

export type AdminKey = keyof typeof S;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAdminT() {
  const { lang, dir } = useLang();

  const t = useCallback(
    (key: AdminKey): string => S[key][lang],
    [lang],
  );

  /** Interpolates the single `$` placeholder used by the relative-time keys. */
  const tn = useCallback(
    (key: AdminKey, n: number | string): string => S[key][lang].replace('$', String(n)),
    [lang],
  );

  /** Interpolates the `$d` (domain) / `$g` (game) placeholders in reason keys. */
  const tdg = useCallback(
    (key: AdminKey, domain: string, game: string): string =>
      S[key][lang].replace('$d', domain).replace('$g', game),
    [lang],
  );

  /** Falls back to the raw id when a game/domain isn't in the map. */
  const lookup = useCallback(
    (prefix: string, id: string | null | undefined, fallback = '—'): string => {
      if (!id) return fallback;
      const key = `${prefix}.${id}` as AdminKey;
      return key in S ? S[key][lang] : id;
    },
    [lang],
  );

  return useMemo(() => ({
    t,
    tn,
    tdg,
    lang,
    dir,
    /** Locale for toLocaleDateString / toLocaleString. */
    locale: lang === 'he' ? 'he-IL' : 'en-US',
    gameLabel:   (id: string | null | undefined) => lookup('game', id),
    domainLabel: (id: string | null | undefined) => lookup('domain', id),
    domainShort: (id: string | null | undefined) => lookup('domainShort', id),
    rankLabel:   (id: string | null | undefined) => lookup('rank', id),
    progressLabel: (id: string | null | undefined) => lookup('progress', id),
    netDirLabel: (id: string | null | undefined) => lookup('netdir', id),
    priorityLabel: (id: string | null | undefined) => lookup('priority', id),
  }), [t, tn, tdg, lang, dir, lookup]);
}

/** Canonical game ids the admin panel knows how to label. */
export const ADMIN_GAME_IDS = [
  'shapes-click', 'color-trains', 'tictactoe', 'memory',
  'green-light', 'spot-difference', 'where-was-it', 'find-letter',
] as const;

export type AdminGameId = (typeof ADMIN_GAME_IDS)[number];
