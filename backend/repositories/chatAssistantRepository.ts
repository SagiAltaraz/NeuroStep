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
      | 'trainingPlan'
      | 'general';
   needsUserData: boolean;
   dataRequests: string[];
   goalHe: string;
   sessionStatePatch?: ChatSessionStatePatch;
};

const TRAINING_PLAN_KEYWORDS = [
   'התוכנית שלי',
   'התכנית שלי',
   'תוכנית שלי',
   'תכנית שלי',
   'התוכנית האישית',
   'תוכנית אישית',
   'תוכנית האימון',
   'תכנית האימון',
   'תוכנית אימון',
   'תכנית אימון',
   'אימון שבועי',
   'האימון השבועי',
   'מה התוכנית',
   'מה התכנית',
   'plan',
   'my plan',
   'training plan',
   'my training plan',
];

const asksForTrainingPlan = (
   prompt: string,
   history: ChatHistoryMessage[] = []
) => {
   const haystack = [
      prompt,
      ...history.slice(-3).map((message) => message.text),
   ]
      .join(' ')
      .toLowerCase();

   return TRAINING_PLAN_KEYWORDS.some((keyword) =>
      haystack.includes(keyword.toLowerCase())
   );
};

const DEFAULT_PLAN: ChatDataPlan = {
   intent: 'general',
   needsUserData: false,
   dataRequests: [],
   goalHe: 'Answer briefly and directly in Hebrew about NeuroStep.',
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
   if (history.length === 0) return 'No previous chat history in this session.';

   return history
      .map((message, index) => {
         const speaker = message.sender === 'user' ? 'User' : 'Assistant';
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
      'trainingPlan',
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
      if (asksForTrainingPlan(prompt, history)) {
         return {
            intent: 'trainingPlan',
            needsUserData: true,
            dataRequests: ['trainingPlan'],
            goalHe:
               'Briefly show the user their personal training plan: focus domain, top recommended game, and weekly frequency only.',
            sessionStatePatch: {},
         };
      }

      try {
         const message = await createClaudeClient().messages.create({
            model: 'claude-haiku-4-5-20251001',
            system: [
               'You are the planning layer for the NeuroStep chat assistant.',
               'Given the current user prompt and chat-session history, decide which user data should be read before answering.',
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
               '- trainingPlan: the user weekly personalized training plan, including priority domains, recommended games, sessions per week, and reasons',
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
                     '  "intent": "progression|profile|reports|coachReports|alerts|trainingPlan|general",',
                     '  "needsUserData": true,',
                     '  "dataRequests": ["progression", "profile"],',
                     '  "goalHe": "Short answer goal in Hebrew",',
                     '  "sessionStatePatch": {',
                     '    "alertness": "low|medium|high|null",',
                     '    "mood": "positive|neutral|stressed|sad|tired|null",',
                     '    "availableMinutes": 15,',
                     '    "perceivedDifficulty": "too_easy|comfortable|too_hard|null",',
                     '    "preferredDomain": "working-memory|selective-attention|divided-attention|processing-speed|reaction-time|response-inhibition|strategic-thinking|visual-spatial|null",',
                     '    "recommendedSessionLengthMin": 10,',
                     '    "recommendedDifficulty": "easier|normal|harder|null",',
                     '    "notesHe": "Short Hebrew state summary or null"',
                     '  }',
                     '}',
                     '',
                     'recommendedSessionLengthMin MUST be between 5 and 15, scaled by the',
                     "user's level in the cognitive category being trained: lower level →",
                     'shorter (closer to 5); higher level → longer (closer to 15). If the mood',
                     'is tired, bias shorter and set recommendedDifficulty to "easier".',
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
                     'Answer in Hebrew only.',
                     'Keep the final answer very short and focused.',
                     'Default length: one short paragraph, up to 2 sentences.',
                     'Format the answer as clean Markdown with spacing: short intro line, blank line, then up to 2 bullet points when useful.',
                     'Do not output dense paragraphs. Use line breaks so the chat bubble is easy to scan.',
                     'Always include exactly one relevant internal Markdown link when a matching screen exists.',
                     'Keep links on their own line when possible.',
                     'For trainingPlan intent: include only focus domain, top recommended game, and weekly frequency; do not list every item unless the user asks.',
                     'For trainingPlan intent, the top recommended game MUST be a Markdown link using the item gameHe as label and item gameRoute as href, for example [Memory](/games/memory).',
                     'For training plans, prefer [המסע שלי](/journey) or [כל המשחקים](/games).',
                     'Always end with exactly one short guiding question in Hebrew.',
                     'The guiding question should prefer alertness and mood; if those are already known, ask about available time, preferred domain, or whether the training feels too easy or too hard.',
                     'Keep the guiding question on its own final line and do not add more than one question mark.',
                     'Use only the collected JSON data when referencing the user personal state.',
                     'Do not invent scores, diagnoses, reports, or personal details that do not appear in the JSON.',
                     'If there is not enough personal data, say so briefly and suggest completing another training session.',
                     '',
                     `Answer goal: ${plan.goalHe}`,
                     '',
                     'Available internal links:',
                     INTERNAL_LINK_GUIDE,
                     '',
                     'Temporary user state collected in this chat session:',
                     JSON.stringify(plan.sessionStatePatch ?? {}, null, 2),
                     '',
                     'Chat history in this session:',
                     formatHistory(history),
                     '',
                     'Current user prompt:',
                     prompt,
                     '',
                     'Data access plan:',
                     JSON.stringify(plan, null, 2),
                     '',
                     'Collected user data:',
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
            max_tokens: 600,
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
