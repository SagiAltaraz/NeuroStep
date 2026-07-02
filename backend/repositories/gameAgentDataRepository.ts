import { firestore } from '../config/firebase.js';

export type AgentDataRequest =
   | 'progression'
   | 'profile'
   | 'stats'
   | 'recentReports'
   | 'coachReports'
   | 'alerts';

export type CollectedAgentData = {
   requested: AgentDataRequest[];
   progression?: Record<string, unknown> | null;
   profile?: Array<Record<string, unknown>>;
   stats?: Array<Record<string, unknown>>;
   recentReports?: Array<Record<string, unknown>>;
   coachReports?: Array<Record<string, unknown>>;
   alerts?: Array<Record<string, unknown>>;
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
]);

const dataOf = (doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
   id: doc.id,
   ...doc.data(),
});

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
               result.profile = snap.docs.map(dataOf);
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
