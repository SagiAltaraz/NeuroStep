import Anthropic from '@anthropic-ai/sdk';
import { CHAT_ASSISTANT_SYSTEM_MESSAGE } from '../config/chatAssistantSystemMessage.ts';
import type { ChatHistoryMessage } from '../agents/gameAgentChatOrchestrator.ts';
import type { CollectedAgentData } from './gameAgentDataRepository.ts';
import type { ChatSessionStatePatch } from './chatSessionRepository.ts';

export class AIProviderError extends Error {
   constructor(
      message: string,
      public readonly status: number = 500
   ) {
      super(message);
      this.name = 'AIProviderError';
   }
}

export type ChatDataPlan = {
   intent:
      | 'progression'
      | 'profile'
      | 'reports'
      | 'coachReports'
      | 'alerts'
      | 'general';
   needsUserData: boolean;
   dataRequests: string[];
   goalHe: string;
   sessionStatePatch?: ChatSessionStatePatch;
};

const DEFAULT_PLAN: ChatDataPlan = {
   intent: 'general',
   needsUserData: false,
   dataRequests: [],
   goalHe: 'ענה למשתמש בעברית בצורה קצרה וברורה על שימוש ב-NeuroStep.',
   sessionStatePatch: {},
};

const INTERNAL_LINK_GUIDE = [
   '- [המסע שלי](/journey): רמה כוללת, דרגה, אזורי התקדמות ותחומים קוגניטיביים.',
   '- [כל המשחקים](/games): בחירת אימון לפי משחק או תחום.',
   '- [זיכרון](/games/memory): אימון זיכרון עבודה.',
   '- [מצא את האות](/games/findLetter): אימון קשב סלקטיבי וחיפוש חזותי.',
   '- [רכבות צבעוניות](/games/colorTracking): אימון קשב מחולק ומהירות עיבוד.',
   '- [מצא את ההבדל](/games/spotDifference): אימון מהירות עיבוד ותפיסה חזותית.',
   '- [אור ירוק](/games/greenLight): אימון זמן תגובה ועיכוב תגובה.',
   '- [צורות קופצות](/games/shapesClick): אימון עיכוב תגובה, קשב וזמן תגובה.',
   '- [איקס עיגול](/games/ticTacToe): אימון חשיבה אסטרטגית.',
   '- [איפה זה היה](/games/whereWasIt): אימון תפיסה מרחבית וזיכרון חזותי.',
].join('\n');

const createClaudeClient = () => {
   const apiKey = process.env.ANTHROPIC_API_KEY;

   if (!apiKey) {
      throw new AIProviderError('ANTHROPIC_API_KEY is not configured.');
   }

   return new Anthropic({ apiKey });
};

const textFromClaude = (message: Anthropic.Messages.Message): string =>
   message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

const parseJsonObject = (text: string): unknown => {
   const match = text.match(/\{[\s\S]*\}/);
   if (!match) return null;

   try {
      return JSON.parse(match[0]);
   } catch {
      return null;
   }
};

const formatHistory = (history: ChatHistoryMessage[] = []): string => {
   if (history.length === 0) return 'אין היסטוריית שיחה קודמת בסשן הנוכחי.';

   return history
      .map((message, index) => {
         const speaker = message.sender === 'user' ? 'משתמש' : 'עוזר';
         return `${index + 1}. ${speaker}: ${message.text}`;
      })
      .join('\n');
};

const toPlan = (value: unknown): ChatDataPlan => {
   if (!value || typeof value !== 'object') return DEFAULT_PLAN;
   const raw = value as Partial<ChatDataPlan>;
   const intents = new Set([
      'progression',
      'profile',
      'reports',
      'coachReports',
      'alerts',
      'general',
   ]);
   const intent =
      typeof raw.intent === 'string' && intents.has(raw.intent)
         ? (raw.intent as ChatDataPlan['intent'])
         : DEFAULT_PLAN.intent;
   const dataRequests = Array.isArray(raw.dataRequests)
      ? raw.dataRequests.filter(
           (item): item is string => typeof item === 'string'
        )
      : [];

   return {
      intent,
      needsUserData:
         typeof raw.needsUserData === 'boolean'
            ? raw.needsUserData
            : dataRequests.length > 0,
      dataRequests,
      goalHe:
         typeof raw.goalHe === 'string' && raw.goalHe.trim()
            ? raw.goalHe.trim()
            : DEFAULT_PLAN.goalHe,
      sessionStatePatch:
         raw.sessionStatePatch && typeof raw.sessionStatePatch === 'object'
            ? (raw.sessionStatePatch as ChatSessionStatePatch)
            : {},
   };
};

export const chatAssistantRepository = {
   async planDataAccess(
      prompt: string,
      history: ChatHistoryMessage[] = []
   ): Promise<ChatDataPlan> {
      try {
         const message = await createClaudeClient().messages.create({
            model: 'claude-haiku-4-5-20251001',
            system: [
               'You are the planning layer for the NeuroStep chat assistant.',
               'Given the current user prompt and the current chat-session history, decide which game-agent outputs should be read before answering.',
               'Use history to resolve follow-up questions such as "what about that?" or "explain more".',
               'Also extract current user-state signals for training adaptation when the user provides them.',
               'Do not infer medical status. Use null for unknown fields.',
               'Return ONLY valid JSON. No markdown, no prose.',
               'Available dataRequests:',
               '- progression: journey map state, rank, overall level, regions, avatar state',
               '- profile: cognitive domain levels, confidence, trends, sessions count',
               '- stats: per-game baselines, difficulty level, sessions count, last accuracy/reaction time',
               '- recentReports: recent per-session cognitive scores, domain scores, summaries',
               '- coachReports: longitudinal reports across multiple sessions',
               '- alerts: performance decline alerts, if any',
               'Set needsUserData=false only for general product/help questions that do not need personal data.',
            ].join('\n'),
            messages: [
               {
                  role: 'user',
                  content: [
                     'Current chat-session history:',
                     formatHistory(history),
                     '',
                     'Current user prompt:',
                     prompt,
                     '',
                     'Return JSON in this exact shape:',
                     '{',
                     '  "intent": "progression|profile|reports|coachReports|alerts|general",',
                     '  "needsUserData": true,',
                     '  "dataRequests": ["progression", "profile"],',
                     '  "goalHe": "מטרת התשובה בעברית קצרה",',
                     '  "sessionStatePatch": {',
                     '    "alertness": "low|medium|high|null",',
                     '    "mood": "positive|neutral|stressed|sad|tired|null",',
                     '    "availableMinutes": 15,',
                     '    "perceivedDifficulty": "too_easy|comfortable|too_hard|null",',
                     '    "preferredDomain": "working-memory|selective-attention|divided-attention|processing-speed|reaction-time|response-inhibition|strategic-thinking|visual-spatial|null",',
                     '    "recommendedSessionLengthMin": 10,',
                     '    "recommendedDifficulty": "easier|normal|harder|null",',
                     '    "notesHe": "סיכום קצר בעברית של המצב הנוכחי או null"',
                     '  }',
                     '}',
                  ].join('\n'),
               },
            ],
            temperature: 0,
            max_tokens: 360,
         });

         return toPlan(parseJsonObject(textFromClaude(message)));
      } catch (error) {
         if (error instanceof AIProviderError) throw error;
         return DEFAULT_PLAN;
      }
   },

   async generateGroundedReply(
      prompt: string,
      plan: ChatDataPlan,
      data: CollectedAgentData | null,
      history: ChatHistoryMessage[] = []
   ): Promise<string> {
      try {
         const message = await createClaudeClient().messages.create({
            model: 'claude-haiku-4-5-20251001',
            system: CHAT_ASSISTANT_SYSTEM_MESSAGE,
            messages: [
               {
                  role: 'user',
                  content: [
                     'ענה למשתמש בעברית בלבד.',
                     'ענה בקצרה. ברירת המחדל היא 1-3 משפטים או עד 3 קישורים רלוונטיים.',
                     'אל תפרט מעבר למה שהתבקש. הרחב רק אם המשתמש ביקש במפורש פירוט, הסבר, דוגמאות או ניתוח.',
                     'כאשר יש מסך פנימי רלוונטי, העדף תמיד להחזיר קישור פנימי במקום תשובה מילולית ארוכה.',
                     'היסטוריית השיחה מיועדת רק להבנת ההקשר. אל תעדיף סיכום של ההיסטוריה על פני הפניה למסך מתאים.',
                     'אם שאלת המשך מתייחסת לנושא שכבר הופיע בהיסטוריה ויש לו מסך מתאים, החזר את הקישור למסך הזה.',
                     'השתמש בקישורי Markdown פנימיים בלבד, למשל [המסע שלי](/journey).',
                     'תן הסבר קצר של משפט אחד לכל היותר לפני או אחרי הקישורים, אלא אם המשתמש ביקש פירוט מפורש.',
                     'בסוף כל תגובה הוסף שאלה מנחה אחת וקצרה למשתמש.',
                     'השאלה המנחה צריכה לשאול בעדיפות על עירנות ומצב רוח, כדי להתאים זמן משחק ורמת קושי.',
                     'אם כבר ידועות העירנות ומצב הרוח מהסשן, אפשר לשאול על זמן פנוי, תחום שרוצה לתרגל או האם האימון מרגיש קל/מאתגר מדי.',
                     'נסח את השאלה באופן טבעי ולא רפואי, למשל: איך העירנות ומצב הרוח שלך עכשיו?',
                     'השאלה צריכה להיות לא יותר ממשפט אחד.',
                     'אם נאסף מצב משתמש בסשן הצ׳אט, השתמש בו כדי להציע זמן אימון ורמת קושי באופן עדין ולא רפואי.',
                     'התייחס להיסטוריית השיחה רק כסשן זמני של 10 דקות, והשתמש בה כדי להבין שאלות המשך.',
                     'השתמש רק במידע שנאסף מהמערכת כאשר אתה מתייחס למצב האישי של המשתמש.',
                     'אל תמציא ציונים, אבחנות רפואיות, או נתונים שלא מופיעים ב-JSON.',
                     'אם אין מספיק מידע אישי, אמור זאת בעדינות והצע להשלים עוד אימון.',
                     '',
                     `מטרת התשובה: ${plan.goalHe}`,
                     '',
                     'קישורים פנימיים זמינים במערכת:',
                     INTERNAL_LINK_GUIDE,
                     '',
                     'מצב המשתמש שנאסף מסשן הצ׳אט הנוכחי:',
                     JSON.stringify(plan.sessionStatePatch ?? {}, null, 2),
                     '',
                     'היסטוריית השיחה בסשן הנוכחי:',
                     formatHistory(history),
                     '',
                     'שאלת המשתמש הנוכחית:',
                     prompt,
                     '',
                     'תוכנית איסוף המידע:',
                     JSON.stringify(plan),
                     '',
                     'מידע שנאסף מתוצרי סוכני המשחק:',
                     JSON.stringify(
                        data ?? {
                           requested: [],
                           note: 'No personal game-agent data was requested.',
                        },
                        null,
                        2
                     ),
                  ].join('\n'),
               },
            ],
            temperature: 0.5,
            max_tokens: 500,
         });

         return textFromClaude(message) || 'לא הצלחתי להכין תשובה כרגע.';
      } catch (error) {
         if (error instanceof AIProviderError) {
            throw error;
         }

         const maybeProviderError = error as {
            message?: string;
            status?: number;
            statusCode?: number;
         };

         throw new AIProviderError(
            maybeProviderError.message ||
               'Unable to connect to the AI service.',
            maybeProviderError.status || maybeProviderError.statusCode || 500
         );
      }
   },

   async generateReply(prompt: string): Promise<string> {
      const plan = await this.planDataAccess(prompt);
      return this.generateGroundedReply(prompt, plan, null);
   },
};

