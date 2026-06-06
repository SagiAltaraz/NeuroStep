# NeuroStep — תוכנית עיצוב מחדש של ה-Adaptive Engine

> מטרה: שמערכת ההתאמה (DDA – Dynamic Difficulty Adjustment) תזיז את רמת הקושי
> **בצורה חלקה, מדויקת ומתכנסת**, לפי הביצועים הקוגניטיביים האמיתיים של המשתמש בכל
> משחק, כך שכל משחק יישאר ב"אזור הזרימה" (Flow Zone) — לא קל מדי, לא קשה מדי —
> וירשם שיפור לאורך זמן. רמת קושי אישית נשמרת בין סשנים.

קהל יעד: מבוגרים, שימוש יומיומי, אימון/מניעה של בעיות קוגניטיביות.

---

## 0. מפת הקבצים הרלוונטיים (איפה נוגעים)

| שכבה | קובץ |
|------|------|
| מנוע ההחלטה | `game-server/agents/adaptive-agent.ts` |
| חיבור/שליחה | `game-server/server.ts` (קורא ל-`processEvent`, שולח `adjustment`) |
| טייפים משותפים | `game-server/types/game.types.ts` + `frontend/src/types/game.types.ts` |
| WebSocket בצד לקוח | `frontend/src/hooks/useGameSession.ts` |
| יישום קושי במשחק | `frontend/src/games/*/<Game>.tsx` → `applyParams()` |
| baseline אישי | `game-server/agents/baseline-agent.ts` (Firestore `users/{uid}/stats/{gameId}`) |
| snapshot סשן | `game-server/agents/analytics-agent.ts` → `getSessionSnapshot()` |

---

## 1. אבחון — למה השינויים יוצאים דרסטיים / לא טובים

### באג A — חוסר עקביות "דלתא מול ערך מוחלט" (קריטי)
- ב-`adaptive-agent.ts` → `buildParams()` עבור **shapes-click**:
  כש-`emaMs` קיים, נשלח **ערך מוחלט** (`circleLifeMs = ema*1.6*0.75`), וכשאין ema נשלחת
  **דלתא** (`-300 / +400`).
- אבל ה-frontend (`ShapesClick.applyParams`) תמיד מתייחס לערך כ**מוחלט**:
  `this.cfg.circleLifeMs = Math.max(500, params.circleLifeMs)`.
- תוצאה 1: במסלול הדלתא, `-300` הופך ל-`Math.max(500, -300)=500ms` — קפיצה מיידית לערך הקיצוני.
- תוצאה 2: `distractorCount: +1/-1` נשלח כדלתא, אבל ה-frontend עושה
  `Math.max(0, round(params))` ⇒ מספר המסיחים **ננעל ל-0 או 1 ולא גדל לעולם**.
- כל 7 המשחקים האחרים מתייחסים לפרמטרים כ**דלתא עקבית** (`cfg.x + params.x`) — כך
  ש-shapes-click הוא היחיד הלא-עקבי, אבל גם גישת הדלתא הכללית בעייתית (ראה בעיה C/D).

### באג B — קפיצה מוחלטת שמתעלמת מהמצב הנוכחי (shapes-click)
`circleLifeMs` מחושב אך ורק מ-`ema*1.6` ומתעלם מ-`cfg` הנוכחי (ברירת מחדל 3000). ההתאמה
הראשונה יכולה להוריד 3000ms→~600ms במכה אחת. **זו הקפיצה הדרסטית שאתה רואה.**

### בעיה C — צעדים בגודל קבוע שלא פרופורציונליים לפער
הדלתות קבועות (`+25px`, `+1 gridSize`, `+1 sequenceLength`). `+1` ב-gridSize זה קפיצה
תפיסתית ענקית (3×3=9 תאים → 4×4=16 תאים). אין שום קשר בין גודל הצעד לבין כמה המשתמש
רחוק מהיעד.

### בעיה D — תנודתיות / "פינג-פונג"
סדר העדיפויות ב-`processEvent` מתהפך: דיוק גבוה (≥0.85) ⇒ harder; כעבור cooldown אחד
דיוק יורד ⇒ easier; חוזר חלילה. אין **רצועת יעד (target band)** ואין **היסטרזיס (dead
zone)**, אז המערכת מתנדנדת סביב הנקודה במקום להתכנס.

### בעיה E — אות מדידה לא מתאים לדומיין הקוגניטיבי
מנוע גנרי שמבוסס על זמן-תגובה (EMA/z-score/trend) לא מתאים ל:
- **memory / where-was-it** (זיכרון עבודה — האות הוא ה-span/דיוק, לא זמן),
- **tictactoe** (תכנון — זמן תגובה כמעט לא רלוונטי).
בנוסף `reactionMs` מתעדכן **רק על hit**, אז במשחקי זיכרון הוא דליל ⇒ המנוע נופל
ל"דיוק בלבד" עם קפיצות גדולות.

### בעיה F — יישום מיידי באמצע סבב
חלק מהמשחקים מיישמים את הפרמטר תוך כדי סבב פעיל (shapes-click). memory כבר מתור דרך
`pendingCardCount` (טוב). צריך **להחיל שינוי קושי רק בגבול הסבב הבא** בכל המשחקים.

### בעיה G — אין התכנסות אישית בין סשנים
ה-baseline שומר רק ממוצע/סטיית-תקן של זמן תגובה. רמת הקושי שהושגה לא נשמרת, אז כל סשן
מתחיל מ-`DEFAULT_CONFIG` ומטפס מאפס מחדש. בשביל "שיפור לאורך זמן" חייבים לשמור את
**רמת הקושי שהמשתמש התכנס אליה (`D`)** ולחזור אליה בסשן הבא.

---

## 2. המודל החדש — רמת קושי נורמלית D ∈ [0,1] עם בקרת רצועת יעד

החלפה של "harder/easier + דלתות קבועות" במשתנה רציף אחד לכל משחק:

```
D ∈ [0,1]   // 0 = הכי קל, 1 = הכי קשה
```

**לולאת הבקרה (כל הערכה, אחרי cooldown + מספיק אירועים):**

1. מחשבים **ציון ביצועים P ∈ [0,1]** (composite, משקלים פר-משחק — ראה §3).
2. מגדירים **רצועת יעד** (flow zone): `P_target = 0.72`, `band = ±0.08` ⇒ [0.64, 0.80].
3. **dead zone**: אם `P` בתוך הרצועה → לא משנים כלום (מונע פינג-פונג).
4. אחרת מעדכנים פרופורציונלית עם צעד מוגבל:
   ```
   error = P - P_target            // P גבוה מהיעד = קל מדי ⇒ צריך להקשות
   step  = clamp(K * error, -STEP_MAX, +STEP_MAX)   // K≈0.5, STEP_MAX≈0.06
   D     = clamp(D + step, 0, 1)
   ```
5. ממפים `D` לפרמטרי המשחק ע"י **אינטרפולציה בין שתי עוגנים** EASY(D=0)↔HARD(D=1) (§3).
6. שולחים **ערכים מוחלטים** (לא דלתות) → frontend מיישם clamp + מחיל **בסבב הבא**.
7. שומרים `D` ל-Firestore (§4) ⇒ הסשן הבא ממשיך מאותה רמה.

### למה זה פותר את הכל
- **דרסטיות**: `STEP_MAX≈0.06` ל-D, והפרמטרים הם אינטרפולציה רציפה — אין יותר קפיצות.
- **תנודתיות**: ה-dead zone + צעד פרופורציונלי גורמים להתכנסות במקום נדנוד.
- **דיוק פר-דומיין**: P נבנה ממדדים מתאimים לכל משחק.
- **התכנסות + שיפור**: D נשמר; מגמת D לאורך זמן = מדד השיפור הקוגניטיבי.
- **עקביות**: ערך מוחלט אחיד בכל המשחקים ⇒ סוף לבאג A.

---

## 3. ציון הביצועים P והעוגנים לכל משחק

### 3.1 נוסחת P גנרית
```
P = wA*acc + wS*speed + wK*streakBonus            // נורמל ל-[0,1], Σw=1
acc        = דיוק בחלון (כבר קיים: accuracyWindow)
speed      = clamp01( (baselineMean - ema) / (2*baselineStdDev) + 0.5 )
             // מהיר מהבייסליין ⇒ speed גבוה. אם אין baseline → wS מתחלק ל-acc.
streakBonus= clamp01(streak / streakTarget)
```
אם למשחק אין אות זמן אמין (memory, where-was-it, tictactoe) → `wS=0` והמשקל עובר ל-`acc`.

### 3.2 טבלת משקלים + עוגנים (EASY → HARD)

> כל פרמטר הוא **ערך מוחלט** שמיוצר ע"י `lerp(easy, hard, D)`. פרמטרים בדידים
> (gridSize/sequenceLength/cardCount) → `Math.round` + היסטרזיס של חצי יחידה כדי לא
> להבהב סביב גבול.

| משחק | דומיין קוגניטיבי | משקלים (acc/speed/streak) | פרמטר | EASY (D=0) | HARD (D=1) |
|------|------------------|---------------------------|-------|-----------|-----------|
| **shapes-click** | קשב מתמשך + מהירות עיבוד | 0.4 / 0.5 / 0.1 | circleLifeMs | 3500 | 900 |
| | | | distractorCount | 0 | 5 |
| **color-trains** | קשב סלקטיבי + עיכוב | 0.4 / 0.5 / 0.1 | trainSpeedPx | 80 | 260 |
| | | | reactionMs (חלון) | 9000 | 2500 |
| **green-light** | עיכוב תגובה (inhibition) | 0.5 / 0.4 / 0.1 | greenWindowMs | 1500 | 550 |
| | | | redHoldMinMs | 1400 | 3200 |
| | | | redHoldMaxMs | 2600 | 5200 |
| **spot-difference** | חיפוש חזותי + הבחנה | 0.55 / 0.35 / 0.1 | gridSize | 3 | 7 |
| | | | similarity | 0.15 | 0.92 |
| | | | roundTimeoutMs | 12000 | 3500 |
| **find-letter** | חיפוש חזותי + עיבוד | 0.5 / 0.4 / 0.1 | gridSize | 4 | 9 |
| | | | roundTimeoutMs | 18000 | 5000 |
| | | | distractorBoost | 0 | 0.85 |
| **where-was-it** | זיכרון עבודה מרחבי (span) | 0.85 / 0 / 0.15 | sequenceLength | 3 | 9 |
| | | | flashDurationMs | 900 | 280 |
| **memory** | זיכרון עבודה / זיווג | 0.85 / 0 / 0.15 | cardCount | 6 | 24 |
| | | | flipTimeMs | 1600 | 450 |
| **tictactoe** | תכנון / תפקוד ניהולי | 1.0 / 0 / 0 (תוצאה בלבד) | aiDepth | 1 | 6 |

> הערכים הם נקודת פתיחה לכיול — לכוונן אחרי בדיקות משחקיות.

---

## 4. שמירת רמת קושי אישית (Firestore)

מסמך: `users/{userId}/stats/{gameId}` (כבר בשימוש ל-baseline). מוסיפים:
```
difficultyLevel: number   // ה-D האחרון בו הסתיים הסשן (0..1)
difficultyUpdatedAt: number
```
- **טעינה** ב-`createAdaptiveState` / תחילת סשן: אם קיים → `D = difficultyLevel`,
  אחרת `D = 0.35` (פתיחה עדינה). anonymous → תמיד 0.35, ללא שמירה.
- **שמירה** ב-`server.ts` ב-`ws.on('close')` (ליד `updateBaseline`) → כותב את `D` הסופי.
- מגמת `difficultyLevel` לאורך זמן = **מדד השיפור** שמוצג למשתמש ול-report/coach agents.

---

## 5. שינויי חוזה (contract) בין שרת ל-frontend

1. כל `params` שנשלח הופך ל**ערך מוחלט** (לא דלתא). מעדכנים `DifficultyParams`
   ב-`game.types.ts` (שני הצדדים) עם השדות לפי הטבלה ב-§3.
2. כל `applyParams()` בכל 8 המשחקים: מ-`cfg.x + params.x` → **`cfg.x = clamp(params.x)`**
   (set, לא add), עם אותם clamps שכבר קיימים.
3. **החלה בגבול סבב**: כל משחק שומר `pendingParams` ומחיל ב-`startRound()` הבא (כמו
   ש-memory כבר עושה עם `pendingCardCount`). אסור לשנות פרמטרים באמצע סבב פעיל.
4. אופציונלי-מומלץ: השרת ישלח גם `level: D` ב-payload, וה-frontend יציג חיווי עדין
   ("רמה מתכווננת") כדי שהשינוי יהיה מובן ולא "קופץ" פסיכולוגית.

---

## 6. רפקטור ל-`adaptive-agent.ts` (לב השינוי)

מבנה חדש:
```ts
// קונפיג בקרה
P_TARGET = 0.72; BAND = 0.08; K = 0.5; STEP_MAX = 0.06;
MIN_EVENTS = 6; COOLDOWN_MS = 8000;   // אפשר להוריד מ-12000 כי הצעדים קטנים עכשיו

interface AdaptiveState {
  ...קיים...
  D: number;                 // רמת קושי נוכחית 0..1
  weights: {wA,wS,wK};       // נטען לפי gameId
}

GAME_TUNING: Record<GameId, { weights, anchorsEasy, anchorsHard, discreteKeys[] }>

function computeP(state): number          // §3.1 לפי weights
function controller(state, P): {D, changed}  // §2 dead-zone + צעד מוגבל
function paramsFromD(gameId, D): DifficultyParams  // lerp easy↔hard + round לבדידים

processEvent():
  1. סינון אירוע (scored?) — נשאר
  2. עדכון accuracyWindow / ema / reactionWindow — נשאר
  3. אם < MIN_EVENTS או בתוך cooldown → return
  4. P = computeP(state)
  5. {D, changed} = controller(state, P)
  6. אם !changed → return {adjusted:false, debug:{P, D}}
  7. state.D = D; state.lastAdjustAt = now
  8. return {adjusted:true, direction: sign(step), reason:`P=${P} D=${D}`,
             params: paramsFromD(gameId, D), debug:{P,D,acc,ema,...}}
```
- מוחקים: `buildParams` הישן, ספי z-score/trend הקבועים כטריגרים ישירים (z/trend עדיין
  יכולים להזין את `speed`/fatigue בתוך P, אבל לא לקבל החלטות דלתא לבד).
- `direction` נשמר רק ל-report/coaching (harder אם step>0).

---

## 7. סדר ביצוע מומלץ (Phases — כל אחד עצמאי וניתן לבדיקה)

**Phase 1 — חוזה אחיד (מתקן את הבאג הכי כואב).**
שינוי כל `applyParams` ל-set+clamp, ושינוי `buildParams` כך שישלח ערכים מוחלטים תואמים.
זה לבד מסיר את הקפיצות של shapes-click ואת באג המסיחים. ✅ ניתן לבדוק מיד.

**Phase 2 — מנוע D + בקר רצועת יעד.**
רפקטור `adaptive-agent.ts` ל-§6, עם `GAME_TUNING` ו-`paramsFromD`. עדיין בלי persistence.

**Phase 3 — ציון P פר-דומיין.**
משקלים מהטבלה, טיפול נכון במשחקי זיכרון/tictactoe (wS=0), נורמליזציית speed מול baseline.

**Phase 4 — החלה בגבול סבב.**
`pendingParams` בכל 8 המשחקים (memory כבר מוכן כדוגמה).

**Phase 5 — persistence של D.**
טעינה ב-init, שמירה ב-`ws.on('close')`, ברירת מחדל 0.35. חיבור למגמת שיפור.

**Phase 6 — כיול + חיווי UX.**
כוונון עוגנים/משקלים אחרי בדיקות, חיווי "רמה" עדין ב-frontend, עדכון report/coach.

---

## 8. בדיקות קבלה (איך יודעים שהצליח)

- אין שום שינוי פרמטר באמצע סבב פעיל.
- בין שתי התאמות עוקבות, אף פרמטר לא משתנה ביותר מ~1 צעד (D זז ≤0.06) → חלק.
- שחקן יציב וטוב מתכנס לרמה גבוהה ונשאר שם (ללא נדנוד) תוך ~6–10 התאמות.
- שחקן שמתעייף (trend עולה / דיוק יורד) → P יורד → D יורד בהדרגה.
- סשן שני של אותו משתמש מתחיל מ-`D` של הסשן הקודם, לא מ-default.
- shapes-click: `distractorCount` באמת גדל מעבר ל-1 כשהמשתמש חזק.
- בדיקות יחידה ל-`computeP` ו-`controller` (dead-zone, clamps, גבולות D).
