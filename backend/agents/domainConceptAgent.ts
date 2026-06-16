type DomainConcept = {
   id: string;
   title: string;
   aliases: string[];
   description: string;
   trains: string;
   example: string;
};

const DOMAIN_CONCEPTS: DomainConcept[] = [
   {
      id: 'working-memory',
      title: 'זיכרון עבודה',
      aliases: ['זיכרון עבודה', 'working memory', 'זכרון עבודה'],
      description: 'היכולת להחזיק מידע בראש לזמן קצר ולהשתמש בו תוך כדי פעולה.',
      trains: 'ב-NeuroStep התחום הזה קשור למשחקים שבהם צריך לזכור מיקומים, רצפים או החלטות קודמות.',
      example: 'לדוגמה: לזכור איפה הופיע קלף או מיקום ולפעול לפי זה בסיבוב הבא.',
   },
   {
      id: 'selective-attention',
      title: 'קשב סלקטיבי',
      aliases: ['קשב סלקטיבי', 'קשב ממוקד', 'selective attention'],
      description: 'היכולת להתמקד בגירוי החשוב ולסנן הסחות דעת.',
      trains: 'ב-NeuroStep זה מופיע במשחקים שבהם צריך לבחור יעד נכון ולהתעלם מגירויים לא רלוונטיים.',
      example: 'לדוגמה: למצוא אות מסוימת או ללחוץ רק על צורה נכונה.',
   },
   {
      id: 'divided-attention',
      title: 'קשב מחולק',
      aliases: ['קשב מחולק', 'קשב מפוצל', 'divided attention'],
      description: 'היכולת לעקוב אחר כמה דברים במקביל ולעבור ביניהם בלי לאבד את המטרה.',
      trains: 'ב-NeuroStep התחום הזה קשור למשימות שבהן יש כמה אובייקטים, צבעים או פעולות שצריך לנהל יחד.',
      example: 'לדוגמה: לעקוב אחר כמה רכבות צבע ולשלוח כל אחת לתחנה המתאימה.',
   },
   {
      id: 'processing-speed',
      title: 'מהירות עיבוד',
      aliases: ['מהירות עיבוד', 'processing speed'],
      description: 'היכולת לקלוט מידע, להבין אותו ולקבל החלטה בזמן קצר.',
      trains: 'ב-NeuroStep זה בא לידי ביטוי במשחקים שבהם צריך לזהות מידע במהירות ולפעול בהתאם.',
      example: 'לדוגמה: לזהות הבדל בתמונה או לבחור במהירות את הפריט הנכון.',
   },
   {
      id: 'reaction-time',
      title: 'זמן תגובה',
      aliases: ['זמן תגובה', 'reaction time'],
      description: 'הזמן שעובר בין הופעת גירוי לבין התגובה של המשתמש.',
      trains: 'ב-NeuroStep התחום הזה נמדד ומשתפר דרך תגובות מהירות אך מדויקות.',
      example: 'לדוגמה: ללחוץ רק כשהאור הופך לירוק או כשהצורה הנכונה מופיעה.',
   },
   {
      id: 'response-inhibition',
      title: 'עיכוב תגובה',
      aliases: ['עיכוב תגובה', 'response inhibition', 'אינהיביציה'],
      description: 'היכולת לעצור תגובה אוטומטית ולבחור פעולה נכונה יותר.',
      trains: 'ב-NeuroStep זה חשוב במשחקים שבהם לא כל גירוי דורש פעולה.',
      example: 'לדוגמה: לא ללחוץ בזמן הלא נכון, גם אם יש דחף להגיב מהר.',
   },
   {
      id: 'strategic-thinking',
      title: 'חשיבה אסטרטגית',
      aliases: ['חשיבה אסטרטגית', 'strategic thinking'],
      description: 'היכולת לתכנן כמה צעדים קדימה, לשקול אפשרויות ולקבל החלטות.',
      trains: 'ב-NeuroStep התחום הזה קשור למשחקים שבהם צריך לחשוב על תוצאה עתידית ולא רק על פעולה מיידית.',
      example: 'לדוגמה: לתכנן מהלך במשחק איקס-עיגול כדי למנוע מהיריב לנצח.',
   },
   {
      id: 'visual-spatial',
      title: 'חשיבה חזותית-מרחבית',
      aliases: ['חשיבה חזותית', 'חשיבה מרחבית', 'תפיסה מרחבית', 'visual spatial', 'visual-spatial'],
      description: 'היכולת להבין מיקומים, צורות ויחסים במרחב.',
      trains: 'ב-NeuroStep זה מופיע במשחקים שבהם צריך לזכור איפה דברים נמצאים או לזהות הבדלים חזותיים.',
      example: 'לדוגמה: לזכור רצף מיקומים או לזהות מה השתנה בין שתי תמונות.',
   },
];

const findConcept = (prompt: string) => {
   const normalizedPrompt = prompt.toLowerCase();
   return DOMAIN_CONCEPTS.find((concept) =>
      concept.aliases.some((alias) => normalizedPrompt.includes(alias.toLowerCase()))
   );
};

const formatConcept = (concept: DomainConcept) =>
   [
      concept.title,
      '',
      concept.description,
      '',
      'איך זה קשור ל-NeuroStep:',
      concept.trains,
      '',
      'דוגמה:',
      concept.example,
   ].join('\n');

export const domainConceptAgent = {
   answer(prompt: string): string {
      const concept = findConcept(prompt);

      if (concept) {
         return formatConcept(concept);
      }

      return [
         'אלה התחומים הקוגניטיביים המרכזיים שמופיעים ב-NeuroStep:',
         '',
         ...DOMAIN_CONCEPTS.map((conceptItem) => `• ${conceptItem.title}`),
         '',
         'אפשר לשאול למשל: “מה זה זיכרון עבודה?” או “הסבר על קשב מחולק”.',
      ].join('\n');
   },
};
