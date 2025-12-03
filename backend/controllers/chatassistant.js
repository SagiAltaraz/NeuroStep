// controllers/chatassistant.js
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const client = new OpenAI({
   apiKey: process.env.OPENAI_API_KEY,
});

export const askFromOpenAI = async (req, res) => {
   const { prompt } = req.body;

   if (!prompt?.trim()) {
      return res.status(400).json({ response: 'Please type a message.' });
   }

   try {
      const completion = await client.chat.completions.create({
         model: 'gpt-4o-mini',
         messages: [
            {
               role: 'system',
               content:
                  'You are a friendly, helpful assistant. Answer in Hebrew unless asked otherwise.',
            },
            { role: 'user', content: prompt },
         ],
         temperature: 0.7,
         max_tokens: 400,
      });

      const reply =
         completion.choices[0]?.message?.content?.trim() || 'לא הבנתי...';
      res.json({ response: reply });
   } catch (error) {
      console.error('OpenAI Error:', error);
      if (error instanceof OpenAI.APIError) {
         return res.status(error.status || 500).json({
            response: `שגיאה מה-AI: ${error.message}`,
         });
      }
      res.status(500).json({
         response: 'אני מתקשה להתחבר ל-AI כרגע. נסה שוב בעוד רגע!',
      });
   }
};
