import { chatAssistantRepository } from '../repositories/chatAssistantRepository.ts';
import { chatSessionRepository } from '../repositories/chatSessionRepository.ts';
import { gameAgentDataRepository } from '../repositories/gameAgentDataRepository.ts';

export type ChatHistoryMessage = {
   sender: 'ai' | 'user';
   text: string;
};

const normalizeHistory = (
   history?: ChatHistoryMessage[]
): ChatHistoryMessage[] => {
   if (!Array.isArray(history)) return [];

   return history
      .filter(
         (message): message is ChatHistoryMessage =>
            (message?.sender === 'ai' || message?.sender === 'user') &&
            typeof message.text === 'string' &&
            message.text.trim().length > 0
      )
      .slice(-12)
      .map((message) => ({
         sender: message.sender,
         text: message.text.trim().slice(0, 1200),
      }));
};

export const gameAgentChatOrchestrator = {
   async answer(
      prompt: string,
      userId?: string,
      history?: ChatHistoryMessage[],
      sessionId?: string
   ): Promise<string> {
      const conversationHistory = normalizeHistory(history);
      const plan = await chatAssistantRepository.planDataAccess(
         prompt,
         conversationHistory
      );

      if (userId && sessionId) {
         chatSessionRepository
            .saveStatePatch({
               userId,
               sessionId,
               prompt,
               patch: plan.sessionStatePatch,
            })
            .catch((error) => {
               console.error('[ChatSession] failed to persist:', error.message);
            });
      }

      if (plan.needsUserData && !userId) {
         return [
            'כדי לענות על המצב האישי שלך צריך להתחבר למערכת.',
            'אחרי התחברות אוכל לקרוא את נתוני המסע, הפרופיל הקוגניטיבי, הדוחות והסטטיסטיקות שנוצרו מהאימונים שלך.',
         ].join('\n');
      }

      const collectedData =
         plan.needsUserData && userId
            ? await gameAgentDataRepository.collectForUser(
                 userId,
                 plan.dataRequests
              )
            : null;

      return chatAssistantRepository.generateGroundedReply(
         prompt,
         plan,
         collectedData,
         conversationHistory
      );
   },
};
