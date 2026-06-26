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

// Eight evenly-spaced hues so every problem card is visually distinct
// from every other problem on the home page.
export const COGNITIVE_PROBLEMS: CognitiveProblem[] = [
  {
    id:       'working-memory',
    icon:     '🧠',
    color:    '#8B5CF6',
    // Deep neural violet → lavender: synapses firing
    gradient: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 45%, #C4B5FD 100%)',
  },
  {
    id:       'selective-attention',
    icon:     '🎯',
    color:    '#2563EB',
    // Navy → sky: a focused spotlight cutting through noise
    gradient: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #93C5FD 100%)',
  },
  {
    id:       'divided-attention',
    icon:     '🔀',
    color:    '#0D9488',
    // Deep teal → cyan: two streams flowing in parallel
    gradient: 'linear-gradient(135deg, #134E4A 0%, #0D9488 50%, #5EEAD4 100%)',
  },
  {
    id:       'processing-speed',
    icon:     '⚡',
    color:    '#D97706',
    // Burnt amber → gold flash: electric speed burst
    gradient: 'linear-gradient(135deg, #92400E 0%, #D97706 45%, #FDE68A 100%)',
  },
  {
    id:       'reaction-time',
    icon:     '🚦',
    color:    '#16A34A',
    // Forest → neon green: stoplight "go" signal
    gradient: 'linear-gradient(135deg, #14532D 0%, #16A34A 50%, #86EFAC 100%)',
  },
  {
    id:       'response-inhibition',
    icon:     '🛑',
    color:    '#DB2777',
    // Crimson → bright pink: sharp "stop" signal
    gradient: 'linear-gradient(135deg, #831843 0%, #DB2777 50%, #FBCFE8 100%)',
  },
  {
    id:       'strategic-thinking',
    icon:     '♟️',
    color:    '#4338CA',
    // Midnight indigo → periwinkle: chess board depth & strategy
    gradient: 'linear-gradient(135deg, #1E1B4B 0%, #4338CA 50%, #A5B4FC 100%)',
  },
  {
    id:       'visual-spatial',
    icon:     '🧩',
    color:    '#EA580C',
    // Deep rust → tangerine → peach: warm spatial panorama
    gradient: 'linear-gradient(135deg, #7C2D12 0%, #EA580C 50%, #FDBA74 100%)',
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
