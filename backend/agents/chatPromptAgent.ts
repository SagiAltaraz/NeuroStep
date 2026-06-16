export type ChatIntent = 'progression' | 'domainConcept' | 'general';

const PROGRESSION_KEYWORDS = [
   'התקדמות',
   'המצב שלי',
   'מה המצב שלי',
   'איפה אני',
   'איפה אני עומד',
   'איפה אני עומדת',
   'מה הרמה שלי',
   'רמה שלי',
   'איזו רמה אני',
   'מה הדירוג שלי',
   'דירוג שלי',
   'המסע שלי',
   'מצב המסע',
   'מסע ההתקדמות',
   'איך אני מתקדם',
   'איך אני מתקדמת',
   'כמה התקדמתי',
   'מה השתפר אצלי',
   'במה השתפרתי',
   'מה החוזקות שלי',
   'במה אני חזק',
   'במה אני חזקה',
   'מה כדאי לי לתרגל',
   'מה להמשיך לתרגל',
   'אילו תחומים לתרגל',
   'תחומים חזקים',
   'תחומים חלשים',
   'שלב שלי',
   'השלב שלי',
   'סטטוס התקדמות',
   'journey',
   'progress',
   'progression',
   'status',
   'my progress',
   'my progression',
   'my journey',
   'my level',
   'my rank',
   'progress status',
   'journey status',
   'current level',
   'current rank',
   'where am i',
   'how am i doing',
   'how did i improve',
   'what improved',
   'my strengths',
   'what should i train',
   'what should i practice',
];

const DOMAIN_CONCEPT_KEYWORDS = [
   'מה זה',
   'מה המשמעות',
   'תסביר',
   'הסבר',
   'ספר לי על',
   'מהו',
   'מהי',
   'מושג',
   'כישור',
   'כישורים',
   'תחום',
   'תחומים',
   'זיכרון עבודה',
   'קשב סלקטיבי',
   'קשב ממוקד',
   'קשב מחולק',
   'קשב מפוצל',
   'מהירות עיבוד',
   'זמן תגובה',
   'עיכוב תגובה',
   'חשיבה אסטרטגית',
   'חשיבה חזותית',
   'חשיבה מרחבית',
   'תפיסה מרחבית',
   'visual spatial',
   'working memory',
   'selective attention',
   'divided attention',
   'processing speed',
   'reaction time',
   'response inhibition',
   'strategic thinking',
];

export const chatPromptAgent = {
   detectIntent(prompt: string, explicitIntent?: ChatIntent): ChatIntent {
      if (explicitIntent) {
         return explicitIntent;
      }

      const normalizedPrompt = prompt.toLowerCase();
      const asksAboutProgression = PROGRESSION_KEYWORDS.some((keyword) =>
         normalizedPrompt.includes(keyword.toLowerCase())
      );

      if (asksAboutProgression) {
         return 'progression';
      }

      const asksAboutDomainConcept = DOMAIN_CONCEPT_KEYWORDS.some((keyword) =>
         normalizedPrompt.includes(keyword.toLowerCase())
      );

      return asksAboutDomainConcept ? 'domainConcept' : 'general';
   },
};
