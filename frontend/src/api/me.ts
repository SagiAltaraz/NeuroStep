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
  id:            ProblemId;
  level:         number;   // 0..100 EMA-smoothed
  confidence:    number;   // 0..1, ramps over the warm-up
  sessionsCount: number;
  trend:         Trend;
}

export interface ProfileResponse {
  domains: DomainProfile[];
}

// One journey-map region (8 of them, keyed by domain).
export interface RegionState {
  node:      number;   // 1..10
  peakNode:  number;
  lastDelta: number;   // +1 climbed · -1 dropped · 0 held
}

export interface ProgressionResponse {
  regions:      Partial<Record<ProblemId, RegionState>>;  // {} for a brand-new user
  overallLevel: number;
  rank:         Rank;
  avatarState:  AvatarState;
}

// Per-game stats (loosely typed — fields depend on which agents have run).
export interface GameStats {
  difficultyLevel?: number;
  sessionsCount?:   number;
  [key: string]:    unknown;
}

export type ApiResult<T> = T | { error: string };

export function isApiError<T>(r: ApiResult<T>): r is { error: string } {
  return typeof r === 'object' && r !== null && 'error' in r;
}

async function authedGet<T>(path: string, token: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
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
  return authedGet<SessionReport>(`/api/me/reports/${encodeURIComponent(sessionId)}`, token);
}

/** GET /api/me/stats/:gameId — the caller's per-game stats. */
export function getMyGameStats(token: string, gameId: string) {
  return authedGet<GameStats>(`/api/me/stats/${encodeURIComponent(gameId)}`, token);
}
