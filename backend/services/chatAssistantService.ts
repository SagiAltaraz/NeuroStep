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

      return gameAgentChatOrchestrator.answer(
         normalizedPrompt,
         userId,
         history,
         sessionId
      );
   },
};
