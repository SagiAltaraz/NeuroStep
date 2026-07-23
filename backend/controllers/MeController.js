// controllers/MeController.js
// Self-service endpoints: a logged-in user reading their OWN cognitive profile,
// journey-map progression, per-session reports, and per-game stats. Every read
// is scoped to req.user.id (set by the `protect` middleware) — a user can never
// read another user's data here (that's what the admin routes are for).
import { firestore } from '../config/firebase.js';
import { buildTrainingPlan, targetMinutesForGame } from '../services/trainingPlan.js';
import { chatSessionRepository } from '../repositories/chatSessionRepository.ts';
import {
   buildCompanionSuggestions,
   COMPANION_CONTEXTS,
   COMPANION_DATA_VERSION,
   COMPANION_TTL_MS,
   parseCompanionContext,
} from '../services/companionSuggestions.js';

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
const CHAT_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{6,120}$/;
const MOOD_RECOMMENDATIONS = {
   alert: {
      patch: { alertness: 'high', recommendedSessionLengthMin: 15 },
      recommendedSessionLengthMin: 15,
   },
   tired: {
      // Tired → shorter session and an easier warm-up.
      patch: { alertness: 'low', mood: 'tired', recommendedDifficulty: 'easier', recommendedSessionLengthMin: 7 },
      recommendedSessionLengthMin: 7,
   },
};

export const updateMyChatSessionMood = async (req, res) => {
   try {
      const sessionId = typeof req.body?.sessionId === 'string'
         ? req.body.sessionId.trim()
         : '';
      const selection = req.body?.selection;
      const recommendation = MOOD_RECOMMENDATIONS[selection];

      if (!CHAT_SESSION_ID_PATTERN.test(sessionId) || !recommendation) {
         return res.status(400).json({ message: 'Invalid chat-session mood update' });
      }

      await chatSessionRepository.saveStatePatch({
         userId: req.user.id,
         sessionId,
         prompt: `companion:mood:${selection}`,
         patch: recommendation.patch,
      });

      return res.json({
         sessionId,
         recommendedSessionLengthMin: recommendation.recommendedSessionLengthMin,
      });
   } catch (err) {
      console.error('[me/chat-session/mood]', err.message);
      return res.status(500).json({ message: 'Failed to update chat session' });
   }
};

export const getMyChatSessionRecommendation = async (req, res) => {
   try {
      const sessionId = req.params.sessionId?.trim() ?? '';
      if (!CHAT_SESSION_ID_PATTERN.test(sessionId)) {
         return res.status(400).json({ message: 'Invalid chat session' });
      }

      const snap = await firestore
         .collection('users')
         .doc(req.user.id)
         .collection('chatSession')
         .doc(sessionId)
         .get();
      const minutes = snap.exists ? snap.data().recommendedSessionLengthMin : null;

      return res.json({
         sessionId,
         recommendedSessionLengthMin:
            typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : null,
      });
   } catch (err) {
      console.error('[me/chat-session/recommendation]', err.message);
      return res.status(500).json({ message: 'Failed to load chat-session recommendation' });
   }
};

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

// GET /api/me/target-time/:gameId — the recommended per-session play time (in
// minutes) for one game, DERIVED from the caller's cognitive profile: weaker /
// declining / higher-priority domains get a longer target. Feeds the in-game
// RecommendedTimeBar. Neutral default for players with no relevant data.
export const getMyTargetTime = async (req, res) => {
   try {
      const userId = req.user.id;
      const { gameId } = req.params;
      const snap = await firestore
         .collection('users')
         .doc(userId)
         .collection('cognitiveProfile')
         .get();
      const domains = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const result = targetMinutesForGame(domains, gameId);
      res.json({ ...result, targetMinutes: result.minutes });
   } catch (err) {
      console.error('[me/target-time]', err.message);
      res.status(500).json({ message: 'Failed to load target time' });
   }
};

// GET /api/me/companion — the proactive companion's next message, derived from
// the caller's own data. The GAME PICK is deterministic (the weakest cognitive
// domain → the game that trains it); the phrasing here is templated Hebrew with
// light variation (a future layer can route this through the LLM for richer
// wording — cached per session to stay token-cheap).
export const getMyCompanion = async (req, res) => {
   try {
      const context = parseCompanionContext(req.query.context);
      if (!context) {
         return res.status(400).json({
            message: 'Unsupported companion context',
            supportedContexts: COMPANION_CONTEXTS,
         });
      }

      const userId = req.user.id;
      const userRef = firestore.collection('users').doc(userId);
      const [userSnap, profSnap, progressionSnap] = await Promise.all([
         userRef.get(),
         userRef.collection('cognitiveProfile').get(),
         context === 'journey-map'
            ? userRef.collection('progression').doc('current').get()
            : Promise.resolve(null),
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

      const plan = buildTrainingPlan(domains);
      const generatedAt = Date.now();
      const suggestions = buildCompanionSuggestions({
         context,
         domains,
         plan,
         progression: progressionSnap?.exists ? progressionSnap.data() : null,
         now: generatedAt,
      });

      // Persist the derived plan so it lives in the DB (queryable, auditable),
      // not only in the dashboard/companion view. Fire-and-forget — a write
      // failure must never break the read. Skipped for brand-new users (no
      // profile yet → an empty cold-start plan isn't worth storing).
      if (!isNew) {
         firestore
            .collection('users')
            .doc(userId)
            .collection('trainingPlan')
            .doc('current')
            .set({ ...plan, updatedAt: Date.now() }, { merge: true })
            .catch((e) => console.error('[companion:persistPlan]', e.message));
      }

      res.json({
         greetingHe,
         reasonHe,
         suggestedGameId,
         suggestedGameHe,
         mood: isNew ? 'welcome' : 'nudge',
         plan,
         context,
         suggestions,
         generatedAt,
         expiresAt: generatedAt + COMPANION_TTL_MS,
         dataVersion: COMPANION_DATA_VERSION,
      });
   } catch (err) {
      console.error('[me/companion]', err.message);
      res.status(500).json({ message: 'Failed to load companion' });
   }
};
