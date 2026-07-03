// E2E: a perfect player hitting circles — expect telemetry D to climb and
// adjustment messages with growing distractorCount / shrinking circleLifeMs.
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3001');
const sessionId = 'e2e-' + Math.floor(Math.random() * 1e6);
let n = 0;
const events: string[] = [];
ws.on('open', () => {
  console.log('[client] connected');
  const iv = setInterval(() => {
    n++;
    ws.send(JSON.stringify({
      gameId: 'shapes-click', sessionId, userId: 'anonymous',
      type: 'CIRCLE_HIT', timestamp: Date.now(),
      payload: { reactionMs: 550 + Math.round(Math.random() * 150), streak: n, level: 1 },
    }));
    if (n >= 30) { clearInterval(iv); setTimeout(() => { ws.send(JSON.stringify({ type: 'end-session' })); }, 500); }
  }, 400);
});
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.type === 'telemetry')  events.push(`telemetry  P=${m.P?.toFixed(2)} D=${m.D?.toFixed(2)}`);
  if (m.type === 'adjustment') events.push(`ADJUSTMENT ${m.direction ?? m.reason} D=${m.level?.toFixed(2)} params=${JSON.stringify(m.params)}`);
  if (m.type === 'session-summary') events.push(`SUMMARY acc=${m.stats?.accuracy} hits=${m.stats?.hits}`);
  if (m.type === 'session-report')  { events.push(`REPORT score=${m.report?.cognitiveScore} levelChanges=${JSON.stringify(m.levelChanges)}`); ws.close(); }
});
ws.on('close', () => { console.log(events.join('\n')); process.exit(0); });
setTimeout(() => { console.log('TIMEOUT\n' + events.join('\n')); process.exit(1); }, 40000);
