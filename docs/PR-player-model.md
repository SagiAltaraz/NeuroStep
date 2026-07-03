# PR: Cognitive Player Model — מודל שחקן התנהגותי, תוכנית אימונים ו-Director

**Branch:** `shape` · **Date:** 2026-07-02 · **Scope:** game-server בלבד (אפס שינויי frontend)

> מסמך הכנה ל-code review. קריאה מומלצת לפי הסדר: המוטיבציה → זרימת הנתונים →
> קובץ-קובץ → צ'קליסט הסקירה. עיצוב מלא: [cognitive-player-model.md](cognitive-player-model.md) · מפת סכמה: [schema.sql](schema.sql)

---

## 1. מה הוספנו ולמה (TL;DR)

עד עכשיו המערכת ידעה **כמה טוב** שחקן מבצע (ציון, רמה, nodes). ה-PR הזה מוסיף
את השכבה שיודעת **איך הוא משחק** ו**מה לעשות עם זה**:

1. **טביעת אצבע התנהגותית חיה** (`live-model.ts`) — אימפולסיביות, היסוס, התאוששות
   מטעות, עייפות — מחושבת תוך כדי משחק ונכתבת ל-Firestore בצורה מרוסנת (throttled).
2. **Path Director דטרמיניסטי** — לא רק "קשה/קל יותר" אלא *איזה סוג אתגר*:
   שחקן אימפולסיבי מקבל מסיחים (אימון עיכוב-תגובה), לא עוד מהירות.
3. **אותות בריאות ארוכי-טווח בפרופיל** (`profile-agent.ts` v2) — volatility,
   plateau, שיא אישי, ו-**deteriorationFlag** שמרני למעקב מטפלים + **timeline**
   פר-יכולת (הגרף של חודשים).
4. **תוכנית אימונים אישית** (`planner-agent.ts`) — במה להתמקד, איזה משחקים,
   ואיפה לפתוח כל משחק — נבנית מחדש אחרי כל סשן, דטרמיניסטית, אפס טוקנים.
5. **Director LLM מגודר** (`director-agent.ts`) — רק בסשני milestone, פלט JSON
   מאומת Zod (fail-closed), והפרומפט המדויק נשמר ל-observability.

**עקרון מנחה (ללא שינוי מהקיים):** דטרמיניסטי קודם, LLM רק לייעוץ/נרטיב,
הכל fail-closed, ואפס כתיבות Firestore per-event.

---

## 2. זרימת הנתונים אחרי השינוי

```
תוך כדי משחק (hot path — נשאר in-memory):
  event → processEvent (adaptive-agent)
        → recordFeature → state.featureEvents        [חדש — append בלבד, capped 300]
        → בכל evaluation: flushLiveModel (throttled ≥15s, fire-and-forget)
              → users/{uid}/liveModel/{gameId}       [חדש]

סוף סשן (finalizeSession ב-server.ts):
  flushLiveModel(force) + playstyleTags               [חדש]
  → updateCognitiveProfile(…, tags)                   [מועשר: volatility, plateau,
        + appendTimelinePoint per domain               deterioration, best, tags]
  → updateProgression (ללא שינוי)
  → checkAlerts (ללא שינוי)
  → updateTrainingPlan (fire-and-forget)              [חדש]
  → milestone? → runDirector (fire-and-forget)        [חדש]
  → generateSessionReport (ללא שינוי)
```

נקודה חשובה ל-review: **שום דבר חדש לא חוסם את ה-hot path ולא את דחיפת התוצאות
לקליינט** — כל התוספות הן fire-and-forget עם catch, או ריצה לפני שלב שהיה קיים.

---

## 3. קובץ-קובץ

### קבצים חדשים

| קובץ | תפקיד | נקודות ל-review |
|---|---|---|
| `agents/live-model.ts` | ליבה טהורה: `computeLiveFeatures` / `chooseTrainingPath` / `playstyleTags` + עטיפת Firestore עם throttle | כל feature מחזיר `null` כשאין מספיק אות (אף פעם לא ניחוש). throttle ב-Map פר-sessionId, מנוקה ב-force flush |
| `agents/planner-agent.ts` | ליבה טהורה: `computeTrainingPlan` (דירוג: מידרדר→יורד→חלש, שער confidence) + עטיפת Firestore | ה-warm-start משתמש **באותה נוסחת blend** של `seedLevelFromProfile` — כדי שהתוכנית והבקר יסכימו |
| `agents/director-agent.ts` | בניית פרומפט מהמודל המובנה, קריאת Claude עם timeout 8s + AbortController, ולידציית Zod, שמירת advice + prompt snapshot | אותו דפוס בדיוק כמו report-agent (timeout, fail-closed, recordTokenUsage) |
| `agents/__tests__/live-model.test.ts` | 12 טסטים | כולל טסט ה"כנות" — אין features מ-3 אירועים |
| `agents/__tests__/planner-agent.test.ts` | 7 טסטים | דירוג, שער confidence, בחירת משחקים, blend |
| `agents/__tests__/profile-enrich.test.ts` | 8 טסטים | plateau, peak, deterioration (נדלק/נכבה) |
| `agents/__tests__/director-agent.test.ts` | 5 טסטים | סכמה fail-closed + רינדור פרומפט |

### קבצים ששונו

| קובץ | השינוי | סיכון |
|---|---|---|
| `agents/adaptive-agent.ts` | נוסף `featureEvents` ל-state + `recordFeature` בשני ענפי הקליטה (outcome/רגיל). **אפס שינוי בלוגיקת הבקר** | נמוך — append בלבד, capped |
| `agents/profile-agent.ts` | `ProfileState` v2: volatility, plateauCount, deteriorationFlag, bestLevel/bestAt; `readProfileState` עם defaults ל-v1 (back-compat); `appendTimelinePoint`; פרמטר `playstyleTags` אופציונלי | בינוני — נגיעה בליבת הפרופיל. מכוסה ב-13 טסטים (5 ישנים + 8 חדשים) |
| `agents/progression.config.ts` | נוספו `LIVEMODEL_TUNING`, `PLANNER_TUNING` + 4 קבועים ל-PROFILE_TUNING | אפסי — קונסטנטות בלבד |
| `agents/schemas.ts` | נוסף `DirectorOutputSchema` (enums סגורים ל-domains/games/paths, אותן מילים אסורות של הטוסט) | אפסי — תוספת בלבד |
| `agents/token-usage.ts` | `'director'` נוסף ל-union | אפסי |
| `server.ts` | חיווט: flush ב-evaluation, final flush + tags + planner + director ב-finalize | בינוני — **הקובץ הכי חשוב ל-review**, ר' סעיף 4 |
| `agents/__tests__/profile-agent.test.ts` | ליטרל `ProfileState` הושלם בשדות v2 | אפסי |

### דוקומנטציה (חדש)
`README.md` (עודכן) · `docs/cognitive-player-model.md` · `docs/schema.sql` · `docs/prompts/director.md`

---

## 4. הנקודות שהכי שוות בדיקה (איפה הייתי מסתכל במקומך)

1. **server.ts — סדר ה-finalize:** ה-final flush + חישוב tags רצים לפני
   הגמיפיקציה; planner/director הם fire-and-forget בתוך בלוק ה-try של
   הגמיפיקציה. לוודא שאין await חוסם חדש על המסלול שדוחף `session-report`.
2. **הגדרת deteriorationFlag** (`profile-agent.ts`): confidence ≥ 0.6 **וגם**
   `bestLevel − level ≥ 8` **וגם** `trend !== 'up'`. בחרנו "לא מתאושש" ולא
   "יורד" — כדי שירידה שמתייצבת נמוך תמשיך להיחשב הידרדרות, והדגל נכבה ברגע
   שהמגמה מתהפכת. יש טסט לשני הכיוונים.
3. **חלוקת אימפולסיביות/היסוס** (`live-model.ts`): commission (miss) =
   אימפולסיביות; omission (timeout) + hits איטיים מ-mean+σ = היסוס.
   ב-tictactoe (outcome) — הפסד נרשם כ-miss, בלי RT.
4. **Firestore hygiene:** אין `undefined` בכתיבות (הכל `null`), כל doc חדש עם
   `v`, כל כתיבה חדשה עטופה ב-catch, וה-flush החי מוגבל ל-≥15 שניות.
5. **Back-compat:** doc פרופיל v1 נקרא עם defaults (`bestLevel` נזרע מה-level
   הנוכחי, `bestAt: 0`). אין מיגרציה נדרשת.

---

## 5. עדות בדיקות

```
npx tsc --noEmit   → נקי
npx vitest run     → 13 קבצים, 92/92 עוברים (59 קיימים + 33 חדשים)
adaptive-agent.sim → הבקר מתכנס, maxStep ≤ 0.12, אפס reversals (ללא שינוי)
```

מה **לא** מכוסה (מודע): אינטגרציית Firestore אמיתית (העטיפות דקות ועקביות עם
הדפוס הקיים), וקריאת Claude חיה של ה-Director (מכוסה סכמה + פרומפט; אותו דפוס
timeout/fallback של report-agent שכבר בפרודקשן).

---

## 6. מה במפורש לא בסקופ

- אין שינוי בשום משחק ב-frontend ואין שינוי בפרוטוקול ה-WS.
- ה-Director **לא משפיע על שום החלטה** עדיין — advisory בלבד, נשמר ל-Firestore.
  חיבור ההמלצות ל-UI/לבקר הוא PR נפרד.
- פריסת מחוון הרמה הנראית (`ddaLevel`) לשאר 7 המשחקים — PR נפרד.
