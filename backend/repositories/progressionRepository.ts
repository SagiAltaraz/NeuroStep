import { firestore } from '../config/firebase.js';

export type ProgressionRegion = {
   node?: number;
   peakNode?: number;
   lastDelta?: number;
};

export type ProgressionData = {
   overallLevel: number;
   rank: string;
   avatarState: string;
   regions: Record<string, ProgressionRegion>;
};

const DEFAULT_PROGRESSION: ProgressionData = {
   overallLevel: 0,
   rank: 'beginner',
   regions: {},
   avatarState: 'idle',
};

export const progressionRepository = {
   async getUserProgression(userId: string): Promise<ProgressionData> {
      const doc = await firestore
         .collection('users')
         .doc(userId)
         .collection('progression')
         .doc('current')
         .get();

      if (!doc.exists) {
         return DEFAULT_PROGRESSION;
      }

      const data = doc.data() ?? {};

      return {
         overallLevel:
            typeof data.overallLevel === 'number'
               ? data.overallLevel
               : DEFAULT_PROGRESSION.overallLevel,
         rank: typeof data.rank === 'string' ? data.rank : DEFAULT_PROGRESSION.rank,
         avatarState:
            typeof data.avatarState === 'string'
               ? data.avatarState
               : DEFAULT_PROGRESSION.avatarState,
         regions:
            data.regions && typeof data.regions === 'object'
               ? (data.regions as Record<string, ProgressionRegion>)
               : DEFAULT_PROGRESSION.regions,
      };
   },
};
