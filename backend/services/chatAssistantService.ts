import { chatAssistantRepository } from '../repositories/chatAssistantRepository.ts';

export class InvalidPromptError extends Error {
   constructor() {
      super('Please type a message.');
      this.name = 'InvalidPromptError';
   }
}

export const chatAssistantService = {
   async ask(prompt?: string): Promise<string> {
      const normalizedPrompt = prompt?.trim();

      if (!normalizedPrompt) {
         throw new InvalidPromptError();
      }

      return chatAssistantRepository.generateReply(normalizedPrompt);
   },
};
