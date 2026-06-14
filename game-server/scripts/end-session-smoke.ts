/**
 * Manual smoke test for the B5 end-session lifecycle.
 *
 * Requires a RUNNING game-server (npm run dev) + its Kafka/Firebase deps.
 * Plays a short memory session, then sends an 'end-session' control message and
 * prints every server push. Expect to see: a stream of 'adjustment'/'coaching'
 * (maybe), then 'session-summary', then 'session-report' with levelChanges.
 *
 * Usage:  npx tsx scripts/end-session-smoke.ts [wsUrl] [userId]
 *   e.g.  npx tsx scripts/end-session-smoke.ts ws://localhost:3001 smoke-user-1
 */

import { WebSocket } from 'ws';

const WS_URL = process.argv[2] ?? 'ws://localhost:3001';
const USER   = process.argv[3] ?? 'smoke-user-1';
const GAME   = 'memory';
const SESSION = `${GAME}-smoke-${Date.now()}`;

const ws = new WebSocket(WS_URL);

function send(obj: Record<string, unknown>) {
  ws.send(JSON.stringify(obj));
}

function gameEvent(type: string, extra: Record<string, unknown> = {}) {
  send({ gameId: GAME, sessionId: SESSION, userId: USER, type, timestamp: Date.now(), payload: {}, ...extra });
}

ws.on('open', async () => {
  console.log(`[smoke] connected ${WS_URL} | session=${SESSION} user=${USER}`);
  // 8 scored events: 6 matches (hits) + 2 misses, with reaction times.
  const seq: Array<[string, Record<string, unknown>]> = [
    ['PAIR_MATCHED', { reactionMs: 900 }],
    ['PAIR_MATCHED', { reactionMs: 850 }],
    ['PAIR_MISSED',  {}],
    ['PAIR_MATCHED', { reactionMs: 820 }],
    ['PAIR_MATCHED', { reactionMs: 780 }],
    ['PAIR_MATCHED', { reactionMs: 760 }],
    ['PAIR_MISSED',  {}],
    ['PAIR_MATCHED', { reactionMs: 740 }],
  ];
  for (const [type, extra] of seq) {
    gameEvent(type, extra);
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('[smoke] sending end-session');
  send({ type: 'end-session', sessionId: SESSION, userId: USER, gameId: GAME });
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  console.log(`[smoke] ← ${msg.type}`, JSON.stringify(msg).slice(0, 400));
  if (msg.type === 'session-report') {
    console.log('[smoke] got session-report — done');
    ws.close();
    setTimeout(() => process.exit(0), 100);
  }
});

ws.on('error', (e) => { console.error('[smoke] error', e.message); process.exit(1); });

// Safety timeout
setTimeout(() => { console.error('[smoke] timed out waiting for session-report'); process.exit(2); }, 20_000);
