import type { Request, Response } from 'express';
import { AIProviderError } from '../repositories/chatAssistantRepository.ts';
import {
   chatAssistantService,
   InvalidPromptError,
} from '../services/chatAssistantService.ts';

type AskAIRequestBody = {
   prompt?: string;
   intent?: 'progression' | 'domainConcept' | 'general';
};

export const askFromOpenAI = async (
   req: Request<Record<string, never>, unknown, AskAIRequestBody> & {
      user?: { id?: string };
   },
   res: Response
) => {
   try {
      const response = await chatAssistantService.ask(
         req.body.prompt,
         req.user?.id,
         req.body.intent
      );
      return res.json({ response });
   } catch (error) {
      if (error instanceof InvalidPromptError) {
         return res.status(400).json({ response: error.message });
      }

      if (error instanceof AIProviderError) {
         console.error('AI provider error:', error);
         return res.status(error.status).json({
            response: `שגיאה משירות ה-AI: ${error.message}`,
         });
      }

      console.error('Chat assistant error:', error);
      return res.status(500).json({
         response: 'לא ניתן להתחבר ל-AI כרגע. נסה שוב בעוד רגע.',
      });
   }
};
