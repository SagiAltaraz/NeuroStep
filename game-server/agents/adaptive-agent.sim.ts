/**
 * Adaptive engine simulation harness.
 *
 * Feeds synthetic event streams from modelled players into processEvent() and
 * checks the controller converges to a stable difficulty without oscillating.
 *
 * Run:  (from game-server, with deps resolvable)
 *   npx tsx agents/adaptive-agent.sim.ts
 *
 * It uses userId='anonymous' so Firestore is never touched. For scenarios that
 * exercise the speed path, a baseline is injected directly into the state.
 */

import { createAdaptiveState, processEvent, type AdaptiveState } from './adaptive-agent.js';
import type { GameId } from '../types/game.types.js';

// Simulated clock — events are seconds apart in real play. Without this, the
// anti-burst cooldown (wall-clock) would block every adjustment in a tight loop.
let fakeNow = 1_000_000;
const MS_PER_EVENT = 1_800;
Date.now = () => fakeNow;
function tick() { fakeNow += MS_PER_EVENT; }

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function randn() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; } // ~N(0,1)

interface Trace { event: number; D: number; P: number | null; acc: number; }

/** Generic accuracy-style player: hit prob rises when skill > difficulty. */
async function runAccuracyGame(opts: {
  gameId: GameId; hitType: string; missType: string;
  skill: number; events: number; baseline?: { mean: number; std: number };
  skillRamp?: number;     // skill change per event (improvement / fatigue)
}): Promise<{ traces: Trace[]; state: AdaptiveState }> {
  const state = createAdaptiveState('sim', opts.gameId, 'anonymous');
  if (opts.baseline) {
    state.profileLoaded  = true;
    state.baselineMean   = opts.baseline.mean;
    state.baselineStdDev = opts.baseline.std;
  }
  const traces: Trace[] = [];
  let skill = opts.skill;

  for (let i = 1; i <= opts.events; i++) {
    tick();
    skill = clamp(skill + (opts.skillRamp ?? 0), 0.05, 0.98);
    const pHit = clamp(0.5 + 0.6 * (skill - state.D), 0.03, 0.98);
    const isHit = Math.random() < pHit;
    // faster when more skilled / lower difficulty
    const rt = Math.round(clamp(350 + 900 * state.D - 300 * skill + 120 * randn(), 150, 4000));

    const res = await processEvent(state, {
      type:       isHit ? opts.hitType : opts.missType,
      reactionMs: isHit ? rt : undefined,
    });
    if (res.adjusted || res.debug) {
      traces.push({ event: i, D: state.D, P: res.debug?.P ?? null, acc: res.debug?.accuracy ?? 0 });
    }
  }
  return { traces, state };
}

/** tic-tac-toe outcome player: win prob rises when skill > difficulty. */
async function runOutcomeGame(opts: { skill: number; games: number }) {
  const state = createAdaptiveState('sim', 'tictactoe', 'anonymous');
  state.profileLoaded = true;
  const traces: Trace[] = [];
  for (let i = 1; i <= opts.games; i++) {
    tick();
    const pWin = clamp(0.5 + 0.7 * (opts.skill - state.D), 0.03, 0.97);
    const r = Math.random();
    let res;
    if (r < pWin)        res = await processEvent(state, { type: 'GAME_WON', winner: 'player' });
    else if (r < pWin + 0.12) res = await processEvent(state, { type: 'GAME_DRAW' });
    else                 res = await processEvent(state, { type: 'GAME_WON', winner: 'ai' });
    if (res.adjusted || res.debug) traces.push({ event: i, D: state.D, P: res.debug?.P ?? null, acc: 0 });
  }
  return { traces, state };
}

function report(name: string, traces: Trace[], finalD: number) {
  let maxStep = 0;
  for (let i = 1; i < traces.length; i++) maxStep = Math.max(maxStep, Math.abs(traces[i].D - traces[i - 1].D));
  // oscillation: count direction reversals in D
  let reversals = 0;
  for (let i = 2; i < traces.length; i++) {
    const a = traces[i - 1].D - traces[i - 2].D;
    const b = traces[i].D - traces[i - 1].D;
    if (a * b < -1e-9) reversals++;
  }
  const tail = traces.slice(-5).map(t => t.D.toFixed(2)).join(' ');
  console.log(
    `\n${name}\n  finalD=${finalD.toFixed(3)}  maxStep=${maxStep.toFixed(3)}  reversals=${reversals}` +
    `  adjustments=${traces.length}\n  D tail: ${tail}`,
  );
}

async function main() {
  console.log('=== Adaptive engine simulation ===');

  {
    const { traces, state } = await runAccuracyGame({
      gameId: 'shapes-click', hitType: 'CIRCLE_HIT', missType: 'TIMEOUT', skill: 0.85, events: 80,
    });
    report('shapes-click | strong player (no baseline)', traces, state.D);
  }
  {
    const { traces, state } = await runAccuracyGame({
      gameId: 'shapes-click', hitType: 'CIRCLE_HIT', missType: 'TIMEOUT', skill: 0.35, events: 80,
    });
    report('shapes-click | weak player (no baseline)', traces, state.D);
  }
  {
    const { traces, state } = await runAccuracyGame({
      gameId: 'shapes-click', hitType: 'CIRCLE_HIT', missType: 'TIMEOUT', skill: 0.8, events: 80,
      baseline: { mean: 500, std: 120 },
    });
    report('shapes-click | fast player WITH baseline (speed path)', traces, state.D);
  }
  {
    const { traces, state } = await runAccuracyGame({
      gameId: 'where-was-it', hitType: 'SEQUENCE_COMPLETE', missType: 'SEQUENCE_FAIL', skill: 0.7, events: 40,
    });
    report('where-was-it | working-memory (sparse events)', traces, state.D);
  }
  {
    const { traces, state } = await runAccuracyGame({
      gameId: 'shapes-click', hitType: 'CIRCLE_HIT', missType: 'TIMEOUT', skill: 0.4, events: 120,
      skillRamp: 0.004,   // player improves over the session
    });
    report('shapes-click | improving player (skill 0.4 → ~0.85)', traces, state.D);
  }
  {
    const { traces, state } = await runOutcomeGame({ skill: 0.8, games: 80 });
    report('tic-tac-toe | strong player (outcome path)', traces, state.D);
  }

  console.log('\nExpectation: maxStep ≤ 0.12, few reversals, D tail roughly flat (converged).');
}

main().catch(err => { console.error(err); process.exit(1); });
