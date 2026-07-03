import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../config/firebase.js';

export type ChatSessionStatePatch = {
   alertness?: 'low' | 'medium' | 'high' | null;
   mood?: 'positive' | 'neutral' | 'stressed' | 'sad' | 'tired' | null;
   availableMinutes?: number | null;
   perceivedDifficulty?: 'too_easy' | 'comfortable' | 'too_hard' | null;
   preferredDomain?: string | null;
   recommendedSessionLengthMin?: number | null;
   recommendedDifficulty?: 'easier' | 'normal' | 'harder' | null;
   notesHe?: string | null;
};

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{6,120}$/;

const cleanString = (value: unknown, maxLength = 160): string | null => {
   if (typeof value !== 'string') return null;
   const trimmed = value.trim();
   return trimmed ? trimmed.slice(0, maxLength) : null;
};

const cleanNumber = (value: unknown, min: number, max: number): number | null => {
   if (typeof value !== 'number' || !Number.isFinite(value)) return null;
   return Math.max(min, Math.min(max, Math.round(value)));
};

const cleanEnum = <T extends string>(
   value: unknown,
   allowed: readonly T[]
): T | null => {
   return typeof value === 'string' && allowed.includes(value as T)
      ? (value as T)
      : null;
};

const cleanPatch = (patch: ChatSessionStatePatch = {}) => {
   const data: Record<string, unknown> = {};

   const alertness = cleanEnum(patch.alertness, ['low', 'medium', 'high'] as const);
   if (alertness) data.alertness = alertness;

   const mood = cleanEnum(patch.mood, ['positive', 'neutral', 'stressed', 'sad', 'tired'] as const);
   if (mood) data.mood = mood;

   const availableMinutes = cleanNumber(patch.availableMinutes, 1, 120);
   if (availableMinutes !== null) data.availableMinutes = availableMinutes;

   const perceivedDifficulty = cleanEnum(
      patch.perceivedDifficulty,
      ['too_easy', 'comfortable', 'too_hard'] as const
   );
   if (perceivedDifficulty) data.perceivedDifficulty = perceivedDifficulty;

   const preferredDomain = cleanString(patch.preferredDomain, 80);
   if (preferredDomain) data.preferredDomain = preferredDomain;

   const recommendedSessionLengthMin = cleanNumber(patch.recommendedSessionLengthMin, 3, 45);
   if (recommendedSessionLengthMin !== null) {
      data.recommendedSessionLengthMin = recommendedSessionLengthMin;
   }

   const recommendedDifficulty = cleanEnum(
      patch.recommendedDifficulty,
      ['easier', 'normal', 'harder'] as const
   );
   if (recommendedDifficulty) data.recommendedDifficulty = recommendedDifficulty;

   const notesHe = cleanString(patch.notesHe, 220);
   if (notesHe) data.notesHe = notesHe;

   return data;
};

export const chatSessionRepository = {
   async saveStatePatch(opts: {
      userId: string;
      sessionId?: string;
      prompt: string;
      patch?: ChatSessionStatePatch;
   }): Promise<void> {
      const sessionId = opts.sessionId?.trim();
      if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) return;

      const statePatch = cleanPatch(opts.patch);
      const ref = firestore
         .collection('users')
         .doc(opts.userId)
         .collection('chatSession')
         .doc(sessionId);
      const snap = await ref.get();

      await ref.set(
         {
            sessionId,
            ...statePatch,
            lastPrompt: opts.prompt.slice(0, 1000),
            updatedAt: FieldValue.serverTimestamp(),
            ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
         },
         { merge: true }
      );
   },
};
