import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const askFromOpenAI = async (req, res) => {
   const { prompt } = req.body;

   if (!prompt?.trim()) {
      return res.status(400).json({ response: 'Please type a message.' });
   }

   try {
      const response = await client.chat.completions.create({
         model: 'gpt-4o-mini',
         messages: [
            {
               role: 'system',
               content:
                  'You are a friendly, helpful assistant. Be concise and kind.',
            },
            { role: 'user', content: prompt },
         ],
         temperature: 0.7,
         max_tokens: 100,
      });

      const reply =
         response.choices[0]?.message?.content || "Hmm, I didn't get that.";
      res.json({ response: reply });
   } catch (error) {
      console.error('OpenAI Error:', error.message);
      res.status(500).json({
         response:
            "I'm having trouble connecting to the AI right now. Try again in a moment!",
      });
   }
};

module.exports = { askFromOpenAI };
