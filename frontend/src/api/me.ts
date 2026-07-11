/**
 * api/me — typed client for the self-service /api/me/* endpoints (backend B7).
 *
 * Mirrors the auth.ts convention: every call takes the JWT explicitly and
 * resolves to either the typed payload or `{ error }` (never throws). Read the
 * token from `useAuth().token` at the call site.
 *
 * Response shapes mirror the game-server persistence:
 *   profile      → users/{uid}/cognitiveProfile/{domainId}  (profile-agent, A3)
 *   progression  → users/{uid}/progression/current          (progression, A4)
 *   reports/:id  → sessions/{id}.report                     (report-agent)
 *   stats/:game  → users/{uid}/stats/{gameId}               (adaptive/baseline)
 */
import type { ProblemId } from '../data/cognitiveProblems';
import type { Rank, AvatarState, SessionReport } from '../hooks/useGameSession';

export type Trend = 'up' | 'stable' | 'down';

// One domain's cognitive profile (the numeric core; doc id = the domain id).
export interface DomainProfile {
   id: ProblemId;
   level: number; // 0..100 EMA-smoothed
   confidence: number; // 0..1, ramps over the warm-up
   sessionsCount: number;
   trend: Trend;
}

export interface ProfileResponse {
   domains: DomainProfile[];
}

// One journey-map region (8 of them, keyed by domain).
export interface RegionState {
   node: number; // 1..10
   peakNode: number;
   lastDelta: number; // +1 climbed · -1 dropped · 0 held
}

export interface ProgressionResponse {
   regions: Partial<Record<ProblemId, RegionState>>; // {} for a brand-new user
   overallLevel: number;
   rank: Rank;
   avatarState: AvatarState;
}

// Per-game stats (loosely typed — fields depend on which agents have run).
export interface GameStats {
   difficultyLevel?: number;
   sessionsCount?: number;
   [key: string]: unknown;
}

export interface TrainingPlanItem {
   domainId: ProblemId;
   domainHe: string;
   gameId: string;
   gameHe: string;
   gameRoute?: string;
   level: number;
   trend: Trend;
   deterioration: boolean;
   priority: 'high' | 'medium' | 'low';
   priorityHe: string;
   sessionsPerWeek: number;
   reasonHe: string;
}

export interface TrainingPlan {
   items: TrainingPlanItem[];
   weeklySessions: number;
   focusDomainHe: string | null;
   isColdStart: boolean;
}

export type CompanionContext = 'home' | 'games' | 'journey-map' | 'journey-plan';

export type CompanionSuggestionKind =
   | 'open-assistant'
   | 'recommended-game'
   | 'start-training'
   | 'journey-progress'
   | 'training-plan'
   | 'general';

export type CompanionSuggestionSource =
   | 'profile'
   | 'recent-session'
   | 'training-plan'
   | 'progression'
   | 'fallback';

export interface CompanionSuggestionAction {
   type: 'open-chat' | 'open-game' | 'open-route';
   labelKey: string;
   gameId?: string;
   route?: string;
}

export interface CompanionSuggestionEvidence {
   domainId?: string;
   gameId?: string;
   sessionId?: string;
   planUpdatedAt?: number;
}

export interface CompanionSuggestion {
   id: string;
   kind: CompanionSuggestionKind;
   priority: number;
   messageKey: string;
   messageParams?: Record<string, string | number>;
   action?: CompanionSuggestionAction;
   source: CompanionSuggestionSource;
   evidence?: CompanionSuggestionEvidence;
   generatedAt: number;
   expiresAt: number;
}
// The proactive companion's next message, derived from the caller's own data.
export interface CompanionResponse {
   greetingHe: string;
   reasonHe: string;
   suggestedGameId: string;
   suggestedGameHe: string;
   mood: 'welcome' | 'nudge' | 'praise';
   plan?: TrainingPlan;
   context?: CompanionContext;
   suggestions?: CompanionSuggestion[];
   generatedAt?: number;
   expiresAt?: number;
   dataVersion?: string;
}

export type CompanionMoodSelection = 'alert' | 'tired';

export interface ChatSessionRecommendationResponse {
   sessionId: string;
   recommendedSessionLengthMin: number | null;
}

export type ApiResult<T> = T | { error: string };

export function isApiError<T>(r: ApiResult<T>): r is { error: string } {
   return typeof r === 'object' && r !== null && 'error' in r;
}

async function authedGet<T>(
   path: string,
   token: string
): Promise<ApiResult<T>> {
   try {
      const res = await fetch(path, {
         headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.message || 'Request failed' };
      return data as T;
   } catch {
      return { error: 'Network error' };
   }
}

async function authedJson<T>(
   path: string,
   token: string,
   method: 'PATCH',
   body: unknown
): Promise<ApiResult<T>> {
   try {
      const res = await fetch(path, {
         method,
         headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
         },
         body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.message || 'Request failed' };
      return data as T;
   } catch {
      return { error: 'Network error' };
   }
}

/** GET /api/me/profile — the caller's per-domain cognitive profile. */
export function getMyProfile(token: string) {
   return authedGet<ProfileResponse>('/api/me/profile', token);
}

/** GET /api/me/progression — the caller's journey-map state. */
export function getMyProgression(token: string) {
   return authedGet<ProgressionResponse>('/api/me/progression', token);
}

/** GET /api/me/reports/:sessionId — a full cognitive report the caller owns. */
export function getMyReport(token: string, sessionId: string) {
   return authedGet<SessionReport>(
      `/api/me/reports/${encodeURIComponent(sessionId)}`,
      token
   );
}

/** GET /api/me/stats/:gameId — the caller's per-game stats. */
export function getMyGameStats(token: string, gameId: string) {
   return authedGet<GameStats>(
      `/api/me/stats/${encodeURIComponent(gameId)}`,
      token
   );
}

/** GET /api/me/companion — the proactive companion's data-driven next message. */
export function getMyCompanion(token: string, context?: CompanionContext) {
   const query = context
      ? '?context=' + encodeURIComponent(context)
      : '';
   return authedGet<CompanionResponse>('/api/me/companion' + query, token);
}

export function getMyChatSessionRecommendation(token: string, sessionId: string) {
   return authedGet<ChatSessionRecommendationResponse>(
      `/api/me/chat-session/${encodeURIComponent(sessionId)}/recommendation`,
      token
   );
}

export function updateMyChatSessionMood(
   token: string,
   sessionId: string,
   selection: CompanionMoodSelection
) {
   return authedJson<ChatSessionRecommendationResponse>(
      '/api/me/chat-session/mood',
      token,
      'PATCH',
      { sessionId, selection }
   );
}
