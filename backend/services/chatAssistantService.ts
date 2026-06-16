import { chatPromptAgent, type ChatIntent } from '../agents/chatPromptAgent.ts';
import { domainConceptAgent } from '../agents/domainConceptAgent.ts';
import { progressionChatAgent } from '../agents/progressionChatAgent.ts';
import { chatAssistantRepository } from '../repositories/chatAssistantRepository.ts';

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
      explicitIntent?: ChatIntent
   ): Promise<string> {
      const normalizedPrompt = prompt?.trim();

      if (!normalizedPrompt) {
         throw new InvalidPromptError();
      }

      const intent = chatPromptAgent.detectIntent(normalizedPrompt, explicitIntent);

      if (intent === 'progression') {
         return progressionChatAgent.answer(userId);
      }

      if (intent === 'domainConcept') {
         return domainConceptAgent.answer(normalizedPrompt);
      }

      return chatAssistantRepository.generateReply(normalizedPrompt);
   },
};
