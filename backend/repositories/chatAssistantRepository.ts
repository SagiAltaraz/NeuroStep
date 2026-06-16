import { OpenAI } from 'openai';
import { CHAT_ASSISTANT_SYSTEM_MESSAGE } from '../config/chatAssistantSystemMessage.ts';

export class AIProviderError extends Error {
   constructor(
      message: string,
      public readonly status: number = 500
   ) {
      super(message);
      this.name = 'AIProviderError';
   }
}

const createOpenAIClient = () => {
   const apiKey = process.env.OPENAI_API_KEY;

   if (!apiKey) {
      throw new AIProviderError('OPENAI_API_KEY is not configured.');
   }

   return new OpenAI({ apiKey });
};

export const chatAssistantRepository = {
   async generateReply(prompt: string): Promise<string> {
      try {
         const completion = await createOpenAIClient().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
               { role: 'system', content: CHAT_ASSISTANT_SYSTEM_MESSAGE },
               { role: 'user', content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 200,
         });

         return (
            completion.choices[0]?.message?.content?.trim() || 'לא הבנתי...'
         );
      } catch (error) {
         if (error instanceof AIProviderError) {
            throw error;
         }

         if (error instanceof OpenAI.APIError) {
            throw new AIProviderError(error.message, error.status || 500);
         }

         throw new AIProviderError('Unable to connect to the AI service.');
      }
   },
};
