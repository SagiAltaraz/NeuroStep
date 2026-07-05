// controllers/MeController.js
// Self-service endpoints: a logged-in user reading their OWN cognitive profile,
// journey-map progression, per-session reports, and per-game stats. Every read
// is scoped to req.user.id (set by the `protect` middleware) — a user can never
// read another user's data here (that's what the admin routes are for).
import { firestore } from '../config/firebase.js';
import { buildTrainingPlan, targetMinutes, GAME_DOMAIN } from '../services/trainingPlan.js';

// ── Companion data maps ──────────────────────────────────────────────────────
// Domain → the game whose PRIMARY domain it is (inverse of the game-server's
// GAME_DOMAINS), the Hebrew domain label, and the Hebrew game title. Inlined
// here so the companion endpoint has no cross-module dependency.
const DOMAIN_GAME = {
   'working-memory': 'memory',
   'selective-attention': 'find-letter',
   'divided-attention': 'color-trains',
   'processing-speed': 'spot-difference',
   'reaction-time': 'green-light',
   'response-inhibition': 'shapes-click',
   'strategic-thinking': 'tictactoe',
   'visual-spatial': 'where-was-it',
};
const DOMAIN_HE = {
   'working-memory': 'זיכרון עבודה',
   'selective-attention': 'קשב סלקטיבי',
   'divided-attention': 'קשב מחולק',
   'processing-speed': 'מהירות עיבוד',
   'reaction-time': 'זמן תגובה',
   'response-inhibition': 'עיכוב תגובה',
   'strategic-thinking': 'חשיבה אסטרטגית',
   'visual-spatial': 'חשיבה חזותית-מרחבית',
};
const GAME_HE = {
   memory: 'זיכרון',
   'find-letter': 'מצא את האותיות',
   'color-trains': 'רכבות צבעוניות',
   'spot-difference': 'מצא את ההבדל',
   'green-light': 'אור ירוק',
   'shapes-click': 'צורות קופצות',
   tictactoe: 'איקס עיגול',
   'where-was-it': 'איפה זה היה',
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// GET /api/me/profile — the caller's per-domain cognitive profile (up to 8 docs)
export const getMyProfile = async (req, res) => {
   try {
      const userId = req.user.id;
      const snap = await firestore
         .collection('users')
         .doc(userId)
         .collection('cognitiveProfile')
         .get();
      const domains = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      res.json({ domains });
   } catch (err) {
      console.error('[me/profile]', err.message);
      res.status(500).json({ message: 'Failed to load profile' });
   }
};

// GET /api/me/progression — the caller's journey-map state (single doc)
export const getMyProgression = async (req, res) => {
   try {
      const userId = req.user.id;
      const doc = await firestore
         .collection('users')
         .doc(userId)
         .collection('progression')
         .doc('current')
         .get();
      // Cold-start default so a brand-new user gets a renderable map.
      res.json(
         doc.exists
            ? doc.data()
            : {
                 overallLevel: 0,
                 rank: 'beginner',
                 regions: {},
                 avatarState: 'idle',
              }
      );
   } catch (err) {
      console.error('[me/progression]', err.message);
      res.status(500).json({ message: 'Failed to load progression' });
   }
};

// GET /api/me/reports/:sessionId — the full cognitive report for one of the
// caller's sessions (used if the end-of-session WS push was missed).
export const getMyReport = async (req, res) => {
   try {
      const userId = req.user.id;
      const { sessionId } = req.params;
      const doc = await firestore.collection('sessions').doc(sessionId).get();
      const report = doc.exists ? doc.data().report : null;
      if (!report) return res.status(404).json({ message: 'Report not found' });
      // Ownership check — the session doc isn't under the user subtree.
      if (report.userId !== userId) {
         return res.status(403).json({ message: 'Forbidden' });
      }
      res.json(report);
   } catch (err) {
      console.error('[me/reports]', err.message);
      res.status(500).json({ message: 'Failed to load report' });
   }
};

// GET /api/me/stats/:gameId — the caller's per-game stats (difficultyLevel,
// baseline mean/stdDev, sessionsCount). Used by the difficulty-resume flow.
export const getMyGameStats = async (req, res) => {
   try {
      const userId = req.user.id;
      const { gameId } = req.params;
      const doc = await firestore
         .collection('users')
         .doc(userId)
         .collection('stats')
         .doc(gameId)
         .get();
      res.json(doc.exists ? doc.data() : {});
   } catch (err) {
      console.error('[me/stats]', err.message);
      res.status(500).json({ message: 'Failed to load stats' });
   }
};

// GET /api/me/target-time/:gameId — the recommended per-session play time
// (minutes) for a game, adapted to the caller's ability in that game's PRIMARY
// domain (weaker → a slightly longer session). Cold-start defaults to neutral.
export const getMyTargetTime = async (req, res) => {
   try {
      const userId = req.user.id;
      const { gameId } = req.params;
      const domainId = GAME_DOMAIN[gameId] ?? null;

      let level = 50; // neutral default until a profile exists
      if (domainId) {
         const doc = await firestore
            .collection('users')
            .doc(userId)
            .collection('cognitiveProfile')
            .doc(domainId)
            .get();
         if (doc.exists && typeof doc.data().level === 'number') level = doc.data().level;
      }

      res.json({ gameId, domainId, level, targetMinutes: targetMinutes(level) });
   } catch (err) {
      console.error('[me/target-time]', err.message);
      res.status(500).json({ message: 'Failed to load target time' });
   }
};

// ── Daily check-in ───────────────────────────────────────────────────────────
// The companion asks once a day how the user feels + slept; the answer is stored
// at users/{uid}/checkins/{YYYY-MM-DD} and read by the game-server's adaptive
// warm-up (a tired / poorly-slept day opens the difficulty a touch easier).
const CHECKIN_MOODS = ['good', 'ok', 'tired'];
const CHECKIN_SLEEP = ['well', 'ok', 'bad'];
// UTC day key — the SAME formula the game-server uses, so writes and reads agree.
const todayKey = () => new Date().toISOString().slice(0, 10);

// GET /api/me/checkin/today — today's check-in, or null if not done yet.
export const getMyTodayCheckin = async (req, res) => {
   try {
      const userId = req.user.id;
      const doc = await firestore
         .collection('users')
         .doc(userId)
         .collection('checkins')
         .doc(todayKey())
         .get();
      res.json(doc.exists ? doc.data() : null);
   } catch (err) {
      console.error('[me/checkin:get]', err.message);
      res.status(500).json({ message: 'Failed to load check-in' });
   }
};

// POST /api/me/checkin — record today's { mood, sleep }. Idempotent per day
// (the doc id is the date, so a second submit just overwrites today's answer).
export const postMyCheckin = async (req, res) => {
   try {
      const userId = req.user.id;
      const { mood, sleep } = req.body ?? {};
      if (!CHECKIN_MOODS.includes(mood) || !CHECKIN_SLEEP.includes(sleep)) {
         return res.status(400).json({ message: 'Invalid mood or sleep value' });
      }
      const date = todayKey();
      const data = { mood, sleep, at: Date.now(), date };
      await firestore
         .collection('users')
         .doc(userId)
         .collection('checkins')
         .doc(date)
         .set(data);
      res.json({ ok: true, checkin: data });
   } catch (err) {
      console.error('[me/checkin:post]', err.message);
      res.status(500).json({ message: 'Failed to save check-in' });
   }
};

// GET /api/me/companion — the proactive companion's next message, derived from
// the caller's own data. The GAME PICK is deterministic (the weakest cognitive
// domain → the game that trains it); the phrasing here is templated Hebrew with
// light variation (a future layer can route this through the LLM for richer
// wording — cached per session to stay token-cheap).
export const getMyCompanion = async (req, res) => {
   try {
      const userId = req.user.id;
      const userRef = firestore.collection('users').doc(userId);
      const [userSnap, profSnap] = await Promise.all([
         userRef.get(),
         userRef.collection('cognitiveProfile').get(),
      ]);

      const name = (userSnap.exists && userSnap.data().name) || '';
      const hi = name ? `היי ${name}!` : 'היי!';
      const domains = profSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const isNew = domains.length === 0;

      // Weakest domain = lowest level (ties broken by a 'down' trend).
      const target = isNew
         ? null
         : domains.slice().sort((a, b) => {
              const lv = (a.level ?? 0) - (b.level ?? 0);
              if (lv !== 0) return lv;
              return (
                 (a.trend === 'down' ? -1 : 0) - (b.trend === 'down' ? -1 : 0)
              );
           })[0];

      const domainId = target?.id ?? 'working-memory';
      const suggestedGameId = DOMAIN_GAME[domainId] ?? 'memory';
      const suggestedGameHe = GAME_HE[suggestedGameId];
      const domainHe = DOMAIN_HE[domainId];

      const greetingHe = isNew
         ? `${hi} כיף שהגעת 👋 בוא נתחיל בכיף.`
         : pick([
              `${hi} כיף לראות אותך 👋`,
              `${hi} מוכן לאתגר קצר? 🙂`,
              `${hi} בוא נמשיך להתאמן 💪`,
           ]);

      const reasonHe = isNew
         ? `נתחיל ב"${suggestedGameHe}" — קל ונעים להתחלה.`
         : pick([
              `שמתי לב ש${domainHe} קצת מאחור — בוא נחזק אותו ב"${suggestedGameHe}".`,
              `היום בא לי שנעבוד על ${domainHe}. בא לך "${suggestedGameHe}"?`,
           ]);

      res.json({
         greetingHe,
         reasonHe,
         suggestedGameId,
         suggestedGameHe,
         mood: isNew ? 'welcome' : 'nudge',
         plan: buildTrainingPlan(domains),
      });
   } catch (err) {
      console.error('[me/companion]', err.message);
      res.status(500).json({ message: 'Failed to load companion' });
   }
};
