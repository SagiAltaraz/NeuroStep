/**
 * Cognitive Problems — single source of truth.
 *
 * Adding a new problem:
 *   1. Append a ProblemId to the union type
 *   2. Add an entry to COGNITIVE_PROBLEMS with Hebrew copy + colors
 *   3. Tag the relevant games in GAME_PROBLEMS
 *
 * Adding a new game:
 *   1. Add a row to GAME_PROBLEMS keyed by the GamesPage `id` (the route slug,
 *      e.g. "memory", "shapesClick"), value = list of problems it trains.
 *   2. The carousel + filter pick it up automatically — no other changes needed.
 */

export type ProblemId =
  | 'short-term-memory'
  | 'attention'
  | 'processing-speed'
  | 'reaction-time'
  | 'strategic-thinking'
  | 'response-inhibition';

export interface CognitiveProblem {
  id:            ProblemId;
  titleHe:       string;
  descriptionHe: string;
  icon:          string;   // emoji or short symbol
  color:         string;   // accent hex
  gradient:      string;   // CSS gradient for the card header
}

// ── Problems ─────────────────────────────────────────────────────────────────

export const COGNITIVE_PROBLEMS: CognitiveProblem[] = [
  {
    id:            'short-term-memory',
    titleHe:       'זיכרון לטווח קצר',
    descriptionHe: 'קושי לזכור מידע חדש שנאמר לפני רגע — שמות, מיקום של חפצים, רשימת קניות',
    icon:          '🧠',
    color:         '#8B5CF6',
    gradient:      'linear-gradient(135deg, #8B5CF6 0%, #C084FC 100%)',
  },
  {
    id:            'attention',
    titleHe:       'קשב וריכוז',
    descriptionHe: 'קושי לשמור על קשב לאורך זמן או להתעלם מגירויים מסיחים בסביבה',
    icon:          '👁️',
    color:         '#0EA5E9',
    gradient:      'linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)',
  },
  {
    id:            'processing-speed',
    titleHe:       'מהירות עיבוד',
    descriptionHe: 'הזמן שלוקח לעבד מידע ולקבל החלטה — נוטה להאט עם הגיל',
    icon:          '⚡',
    color:         '#F59E0B',
    gradient:      'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
  },
  {
    id:            'reaction-time',
    titleHe:       'זמן תגובה',
    descriptionHe: 'הזמן בין הגירוי לתגובה — חשוב להתמודדות מהירה עם שינויים בסביבה',
    icon:          '⏱️',
    color:         '#10B981',
    gradient:      'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
  },
  {
    id:            'strategic-thinking',
    titleHe:       'חשיבה אסטרטגית',
    descriptionHe: 'יכולת לתכנן צעדים קדימה, לחשב סיכונים ולקבל החלטות מורכבות',
    icon:          '♟️',
    color:         '#6366F1',
    gradient:      'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
  },
  {
    id:            'response-inhibition',
    titleHe:       'עיכוב תגובה',
    descriptionHe: 'היכולת לעצור פעולה אוטומטית ולבחור באופן מודע — שליטה בדחפים',
    icon:          '✋',
    color:         '#EC4899',
    gradient:      'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)',
  },
];

// ── Game → problems mapping ──────────────────────────────────────────────────
// Keys must match the `id` field used in pages/games/GamesPage.tsx.
// One game can target multiple problems.

export const GAME_PROBLEMS: Record<string, ProblemId[]> = {
  colorTracking: ['reaction-time', 'attention', 'processing-speed'],
  ticTacToe:     ['strategic-thinking', 'short-term-memory'],
  memory:        ['short-term-memory', 'attention'],
  shapesClick:   ['response-inhibition', 'attention', 'reaction-time'],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function gamesForProblem(problemId: ProblemId): string[] {
  return Object.entries(GAME_PROBLEMS)
    .filter(([, problems]) => problems.includes(problemId))
    .map(([gameId]) => gameId);
}

export function problemById(id: string | null): CognitiveProblem | null {
  if (!id) return null;
  return COGNITIVE_PROBLEMS.find(p => p.id === id) ?? null;
}
