import Anthropic from '@anthropic-ai/sdk';
import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../config/firebase.js';

// Single LLM provider across the whole product: Claude (Anthropic). The game
// agents already use Claude Haiku; the website chat widget now does too, so
// there is one model family, one API key, and one place tokens are counted.
const SYSTEM =
   'You are a friendly, helpful assistant for an elderly-focused cognitive ' +
   'training website. Answer in Hebrew unless asked otherwise. Keep answers ' +
   'short, warm, and simple.';

export const askAI = async (req, res) => {
   const { prompt } = req.body;

   if (!prompt?.trim()) {
      return res.status(400).json({ response: 'Please type a message.' });
   }

   const apiKey = process.env.ANTHROPIC_API_KEY;
   if (!apiKey) {
      return res.status(500).json({ response: 'אני מתקשה להתחבר ל-AI כרגע. נסה שוב בעוד רגע!' });
   }

   const client = new Anthropic({ apiKey });

   try {
      const message = await client.messages.create({
         model: 'claude-haiku-4-5-20251001',
         max_tokens: 150,
         system: SYSTEM,
         messages: [{ role: 'user', content: prompt }],
      });

      const reply =
         message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';

      // Token accounting under the shared meta/tokenUsage doc, attributed to the
      // chat agent (mirrors recordTokenUsage in the game-server). Fire-and-forget.
      firestore
         .collection('meta')
         .doc('tokenUsage')
         .set(
            {
               totalInputTokens: FieldValue.increment(message.usage.input_tokens),
               totalOutputTokens: FieldValue.increment(message.usage.output_tokens),
               byAgent: {
                  chat: {
                     input: FieldValue.increment(message.usage.input_tokens),
                     output: FieldValue.increment(message.usage.output_tokens),
                  },
               },
               lastUpdated: Date.now(),
            },
            { merge: true },
         )
         .catch(() => {});

      res.json({ response: reply || 'לא הבנתי...' });
   } catch (error) {
      console.error('Claude Error:', error);
      if (error instanceof Anthropic.APIError) {
         return res.status(error.status || 500).json({
            response: `שגיאה מה-AI: ${error.message}`,
         });
      }
      res.status(500).json({
         response: 'אני מתקשה להתחבר ל-AI כרגע. נסה שוב בעוד רגע!',
      });
   }
};
