import type { ChatIntent } from '../agents/chatPromptAgent.ts';
import {
   gameAgentChatOrchestrator,
   type ChatHistoryMessage,
} from '../agents/gameAgentChatOrchestrator.ts';

export class InvalidPromptError extends Error {
   constructor() {
      super('Please type a message.');
      this.name = 'InvalidPromptError';
   }
}

// Guests get a welcome and an invitation to sign in — never coaching advice,
// and never an LLM call. The UI shows the same line, this is the enforcement.
const GUEST_WELCOME =
   'ברוכים הבאים ל-NeuroStep! [התחבר](/log-in) או [הירשם](/sign-up) כדי להתחיל.';

export const chatAssistantService = {
   async ask(
      prompt?: string,
      userId?: string,
      _explicitIntent?: ChatIntent,
      history?: ChatHistoryMessage[],
      sessionId?: string
   ): Promise<string> {
      const normalizedPrompt = prompt?.trim();

      if (!normalizedPrompt) {
         throw new InvalidPromptError();
      }

      if (!userId) {
         return GUEST_WELCOME;
      }

      return gameAgentChatOrchestrator.answer(
         normalizedPrompt,
         userId,
         history,
         sessionId
      );
   },
};
