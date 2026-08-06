import { firestore } from '../config/firebase.js';
import { buildTrainingPlan } from '../services/trainingPlan.js';
import { syntheticDomainsFromFocus } from '../services/personalizationFocus.js';

export type AgentDataRequest =
   | 'progression'
   | 'profile'
   | 'stats'
   | 'recentReports'
   | 'coachReports'
   | 'alerts'
   | 'trainingPlan';

export type CollectedAgentData = {
   requested: AgentDataRequest[];
   progression?: Record<string, unknown> | null;
   profile?: Array<Record<string, unknown>>;
   stats?: Array<Record<string, unknown>>;
   recentReports?: Array<Record<string, unknown>>;
   coachReports?: Array<Record<string, unknown>>;
   alerts?: Array<Record<string, unknown>>;
   trainingPlan?: Record<string, unknown>;
};

const DEFAULT_REQUESTS: AgentDataRequest[] = [
   'progression',
   'profile',
   'stats',
   'recentReports',
];
const ALLOWED_REQUESTS = new Set<AgentDataRequest>([
   'progression',
   'profile',
   'stats',
   'recentReports',
   'coachReports',
   'alerts',
   'trainingPlan',
]);

const dataOf = (doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
   id: doc.id,
   ...doc.data(),
});

const GAME_ROUTES: Record<string, string> = {
   memory: '/games/memory',
   'find-letter': '/games/findLetter',
   'color-trains': '/games/colorTracking',
   'spot-difference': '/games/spotDifference',
   'green-light': '/games/greenLight',
   'shapes-click': '/games/shapesClick',
   tictactoe: '/games/ticTacToe',
   'where-was-it': '/games/whereWasIt',
};

const safeRequests = (requests: string[] | undefined): AgentDataRequest[] => {
   const cleaned = (requests ?? DEFAULT_REQUESTS).filter(
      (request): request is AgentDataRequest =>
         ALLOWED_REQUESTS.has(request as AgentDataRequest)
   );

   return cleaned.length > 0 ? [...new Set(cleaned)] : DEFAULT_REQUESTS;
};

export const gameAgentDataRepository = {
   async collectForUser(
      userId: string,
      requestedData?: string[]
   ): Promise<CollectedAgentData> {
      const requested = safeRequests(requestedData);
      const userRef = firestore.collection('users').doc(userId);
      const result: CollectedAgentData = { requested };

      // A brand-new user has no cognitiveProfile yet, but they DID fill the
      // onboarding questionnaire — load its derived focus so the chat assistant
      // can still ground its recommendations in what they told us. Fetched once,
      // only when a profile/plan-shaped request needs it.
      const needsFocusFallback =
         requested.includes('profile') || requested.includes('trainingPlan');
      const focusDomains = needsFocusFallback
         ? await userRef.get().then((snap) =>
              syntheticDomainsFromFocus(
                 snap.exists ? (snap.data()?.personalizationFocus ?? null) : null
              )
           )
         : [];

      await Promise.all(
         requested.map(async (request) => {
            if (request === 'progression') {
               const snap = await userRef
                  .collection('progression')
                  .doc('current')
                  .get();
               result.progression = snap.exists ? (snap.data() ?? null) : null;
               return;
            }

            if (request === 'profile') {
               const snap = await userRef.collection('cognitiveProfile').get();
               const domains = snap.docs.map(dataOf);
               // Fall back to the questionnaire-derived focus for a new user.
               result.profile = domains.length ? domains : focusDomains;
               return;
            }

            if (request === 'trainingPlan') {
               const snap = await userRef.collection('cognitiveProfile').get();
               const realDomains = snap.docs.map(dataOf);
               // New user with no play history → plan from the questionnaire focus.
               const domains = realDomains.length ? realDomains : focusDomains;
               const plan = buildTrainingPlan(domains);
               const planWithRoutes = {
                  ...plan,
                  items: plan.items.map((item) => ({
                     ...item,
                     gameRoute: GAME_ROUTES[item.gameId] ?? '/games',
                  })),
               };

               if (!plan.isColdStart) {
                  await userRef
                     .collection('trainingPlan')
                     .doc('current')
                     .set(
                        { ...planWithRoutes, updatedAt: Date.now() },
                        { merge: true }
                     );
               }

               result.trainingPlan = planWithRoutes;
               return;
            }
            if (request === 'stats') {
               const snap = await userRef.collection('stats').get();
               result.stats = snap.docs.map(dataOf);
               return;
            }

            if (request === 'recentReports') {
               const snap = await userRef
                  .collection('reports')
                  .orderBy('generatedAt', 'desc')
                  .limit(6)
                  .get();
               result.recentReports = snap.docs.map(dataOf);
               return;
            }

            if (request === 'coachReports') {
               const snap = await userRef
                  .collection('coachReports')
                  .orderBy('generatedAt', 'desc')
                  .limit(4)
                  .get();
               result.coachReports = snap.docs.map(dataOf);
               return;
            }

            if (request === 'alerts') {
               const snap = await userRef
                  .collection('alerts')
                  .orderBy('createdAt', 'desc')
                  .limit(5)
                  .get();
               result.alerts = snap.docs.map(dataOf);
            }
         })
      );

      return result;
   },
};
