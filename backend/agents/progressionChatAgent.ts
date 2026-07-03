import {
   progressionRepository,
   type ProgressionData,
} from '../repositories/progressionRepository.ts';

const DOMAIN_LABELS_HE: Record<string, string> = {
   'working-memory': 'זיכרון עבודה',
   'selective-attention': 'קשב סלקטיבי',
   'visual-spatial': 'תפיסה מרחבית',
   'processing-speed': 'מהירות עיבוד',
   'response-inhibition': 'עיכוב תגובה',
   'cognitive-flexibility': 'גמישות קוגניטיבית',
   'reaction-time': 'זמן תגובה',
   'strategic-thinking': 'חשיבה אסטרטגית',
   'divided-attention': 'קשב מפוצל',
   planning: 'תכנון',
   coordination: 'קואורדינציה',
};

const RANK_LABELS_HE: Record<string, string> = {
   beginner: 'מתחיל',
   explorer: 'חוקר',
   climber: 'מתקדם',
   master: 'מוביל',
};

type ProgressionRegionSummary = {
   id: string;
   label: string;
   node: number;
   peakNode: number;
   lastDelta: number;
};

const formatRegion = (region: { label: string; node: number }) =>
   `${region.label}: שלב ${region.node}`;

const uniqueById = <T extends { id: string }>(items: T[]) => {
   const seen = new Set<string>();
   return items.filter((item) => {
      if (seen.has(item.id)) {
         return false;
      }
      seen.add(item.id);
      return true;
   });
};

const toRegionSummaries = (
   progression: ProgressionData
): ProgressionRegionSummary[] =>
   Object.entries(progression.regions ?? {})
      .map(([id, region]) => ({
         id,
         label: DOMAIN_LABELS_HE[id] ?? id,
         node: region.node ?? 1,
         peakNode: region.peakNode ?? region.node ?? 1,
         lastDelta: region.lastDelta ?? 0,
      }))
      .sort((a, b) => b.node - a.node);

const summarizeProgression = (progression: ProgressionData) => {
   const sortedRegions = toRegionSummaries(progression);
   const rank = RANK_LABELS_HE[progression.rank] ?? progression.rank;

   if (sortedRegions.length === 0) {
      return [
         'מצב ההתקדמות שלך',
         '',
         `רמה כוללת: ${progression.overallLevel}`,
         `דירוג: ${rank}`,
         '',
         'עדיין אין מספיק נתוני אימון כדי לזהות תחומים חזקים או מגמות.',
         'כדאי להשלים אימון קצר אחד או שניים כדי שהמערכת תוכל להתחיל לבנות תמונת התקדמות אישית.',
      ].join('\n');
   }

   const uniqueRegions = uniqueById(sortedRegions);
   const strongest = uniqueRegions.slice(0, 3);
   const needsPractice = [...uniqueRegions]
      .sort((a, b) => a.node - b.node)
      .slice(0, 2);
   const improved = uniqueRegions.filter((region) => region.lastDelta > 0);
   const declined = uniqueRegions.filter((region) => region.lastDelta < 0);

   const parts = [
      'מצב ההתקדמות שלך',
      '',
      `רמה כוללת: ${progression.overallLevel}`,
      `דירוג: ${rank}`,
      '',
      'התחומים הבולטים שלך:',
      ...strongest.map((region) => `• ${formatRegion(region)}`),
      '',
      'תחומים שכדאי להמשיך לתרגל:',
      ...needsPractice.map((region) => `• ${formatRegion(region)}`),
   ];

   if (improved.length > 0) {
      parts.push(
         '',
         'עלייה אחרונה:',
         ...improved.map((region) => `• ${region.label}`)
      );
   }

   if (declined.length > 0) {
      parts.push(
         '',
         'ירידה זמנית:',
         ...declined.map((region) => `• ${region.label}`),
         'מומלץ לבצע אימון רגוע וקצר בתחומים האלה.'
      );
   }

   const recommendedDomain =
      needsPractice[0]?.label ??
      strongest[0]?.label ??
      'התחום הקוגניטיבי המרכזי';

   parts.push(
      '',
      'איך כדאי להמשיך:',
      `• להתחיל באימון קצר בתחום ${recommendedDomain} למשך 15-30 דקות.`,
      '• לשמור על קצב רגוע ועקבי, ולתת למערכת להתאים את רמת הקושי לפי הביצועים שלך.',
      '• לאחר עוד כמה אימונים, לבדוק שוב את מצב ההתקדמות כדי לראות אם יש שיפור במגמה.'
   );

   return parts.join('\n');
};

export const progressionChatAgent = {
   async answer(userId?: string): Promise<string> {
      if (!userId) {
         return [
            'כדי לענות על מצב ההתקדמות שלך צריך להתחבר למערכת.',
            '',
            'לאחר התחברות אוכל לסכם עבורך:',
            '• רמת מסע',
            '• דירוג',
            '• תחומים חזקים',
            '• תחומים שכדאי להמשיך לתרגל',
         ].join('\n');
      }

      const progression =
         await progressionRepository.getUserProgression(userId);
      return summarizeProgression(progression);
   },
};
