/**
 * Cognitive Problems — single source of truth.
 *
 * Eight clinically-distinct cognitive domains that the app trains.
 * Each game declares which domains it trains and HOW STRONGLY (primary vs.
 * secondary), so we can:
 *   • Filter the games page to show "best trainers" first
 *   • Show "primary skill" badges on game cards
 *   • Drive the Coach Agent's recommendations (future)
 *   • Render the per-game cognitive-area list in instructions automatically
 *
 * Adding a new problem:
 *   1. Append a ProblemId to the union type
 *   2. Add an entry to COGNITIVE_PROBLEMS with colors + icon
 *   3. Add translation keys: problem.<id>.title / problem.<id>.desc
 *   4. Tag the relevant games in GAME_TRAINING
 *
 * Adding a new game:
 *   1. Add a row to GAME_TRAINING keyed by the GamesPage game id
 *   2. Pick ONE primary problem + 1–2 secondary
 *   3. The carousel + filter + instructions pick it up automatically
 */

// ── Domain IDs ──────────────────────────────────────────────────────────────

export type ProblemId =
  | 'working-memory'
  | 'selective-attention'
  | 'divided-attention'
  | 'processing-speed'
  | 'reaction-time'
  | 'response-inhibition'
  | 'strategic-thinking'
  | 'visual-spatial';

export type TrainingStrength = 'primary' | 'secondary';

// ── Domain metadata ─────────────────────────────────────────────────────────

export interface CognitiveProblem {
  id:       ProblemId;
  icon:     string;
  color:    string;     // accent hex
  gradient: string;     // CSS gradient for the card header
}

export const COGNITIVE_PROBLEMS: CognitiveProblem[] = [
  {
    id:       'working-memory',
    icon:     '🧠',
    color:    '#8B5CF6',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #C084FC 100%)',
  },
  {
    id:       'selective-attention',
    icon:     '👁️',
    color:    '#0EA5E9',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)',
  },
  {
    id:       'divided-attention',
    icon:     '🔀',
    color:    '#14B8A6',
    gradient: 'linear-gradient(135deg, #14B8A6 0%, #2DD4BF 100%)',
  },
  {
    id:       'processing-speed',
    icon:     '⚡',
    color:    '#F59E0B',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
  },
  {
    id:       'reaction-time',
    icon:     '⏱️',
    color:    '#10B981',
    gradient: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
  },
  {
    id:       'response-inhibition',
    icon:     '✋',
    color:    '#EC4899',
    gradient: 'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)',
  },
  {
    id:       'strategic-thinking',
    icon:     '♟️',
    color:    '#6366F1',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
  },
  {
    id:       'visual-spatial',
    icon:     '🧩',
    color:    '#F97316',
    gradient: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)',
  },
];

// ── Game → domain mapping (strength-tagged) ─────────────────────────────────
// Keys match the `id` field in GamesPage.tsx's `games` array.
// Each game has exactly one `primary` and 1–2 `secondary` problems.

export interface GameTraining {
  problemId: ProblemId;
  strength:  TrainingStrength;
}

export const GAME_TRAINING: Record<string, GameTraining[]> = {
  // ── Existing games ─────────────────────────────────────────────
  memory: [
    { problemId: 'working-memory',      strength: 'primary'   },
    { problemId: 'selective-attention', strength: 'secondary' },
    { problemId: 'visual-spatial',      strength: 'secondary' },
  ],
  ticTacToe: [
    { problemId: 'strategic-thinking',  strength: 'primary'   },
    { problemId: 'working-memory',      strength: 'secondary' },
    { problemId: 'visual-spatial',      strength: 'secondary' },
  ],
  shapesClick: [
    { problemId: 'response-inhibition', strength: 'primary'   },
    { problemId: 'selective-attention', strength: 'secondary' },
    { problemId: 'reaction-time',       strength: 'secondary' },
  ],
  colorTracking: [
    { problemId: 'divided-attention',   strength: 'primary'   },
    { problemId: 'processing-speed',    strength: 'secondary' },
    { problemId: 'reaction-time',       strength: 'secondary' },
  ],

  // ── Upcoming games (stubs — implementation pending) ────────────
  greenLight: [
    { problemId: 'reaction-time',       strength: 'primary'   },
    { problemId: 'response-inhibition', strength: 'secondary' },
  ],
  spotDifference: [
    { problemId: 'processing-speed',    strength: 'primary'   },
    { problemId: 'selective-attention', strength: 'secondary' },
    { problemId: 'visual-spatial',      strength: 'secondary' },
  ],
  whereWasIt: [
    { problemId: 'visual-spatial',      strength: 'primary'   },
    { problemId: 'working-memory',      strength: 'secondary' },
  ],
  findLetter: [
    { problemId: 'selective-attention', strength: 'primary'   },
    { problemId: 'processing-speed',    strength: 'secondary' },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

export interface GameMatch { gameId: string; strength: TrainingStrength; }

/** Games that train a given problem, primary first then secondary. */
export function gamesForProblem(problemId: ProblemId): GameMatch[] {
  const matches: GameMatch[] = [];
  for (const [gameId, trainings] of Object.entries(GAME_TRAINING)) {
    const hit = trainings.find(t => t.problemId === problemId);
    if (hit) matches.push({ gameId, strength: hit.strength });
  }
  // Primary first, then secondary
  return matches.sort((a, b) =>
    a.strength === b.strength ? 0 : a.strength === 'primary' ? -1 : 1,
  );
}

/** Inverse lookup — every problem a single game trains. */
export function problemsForGame(gameId: string): GameTraining[] {
  return GAME_TRAINING[gameId] ?? [];
}

export function problemById(id: string | null): CognitiveProblem | null {
  if (!id) return null;
  return COGNITIVE_PROBLEMS.find(p => p.id === id) ?? null;
}
