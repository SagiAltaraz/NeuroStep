// End-to-end check: connect to the running game-server, fire shapes-click hits,
// and print any difficulty adjustment the server sends back.
import { WebSocket } from 'ws';

const ws = new WebSocket('ws://localhost:3001');
const sessionId = `e2e-${Date.now()}`;
let adjustments = 0;

ws.on('open', async () => {
  console.log('[e2e] connected → sending 14 CIRCLE_HIT events (fast & accurate player)');
  for (let i = 0; i < 14; i++) {
    ws.send(JSON.stringify({
      gameId: 'shapes-click',
      sessionId,
      userId: 'anonymous',
      type: 'CIRCLE_HIT',
      timestamp: Date.now(),
      reactionMs: 420,
      payload: { reactionMs: 420, streak: i + 1 },
    }));
    await new Promise(r => setTimeout(r, 800));
  }
  setTimeout(() => {
    console.log(`[e2e] done — received ${adjustments} adjustment(s)`);
    ws.close();
    process.exit(adjustments > 0 ? 0 : 1);
  }, 1500);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'adjustment') {
    adjustments++;
    console.log(`[e2e] ✓ ADJUSTMENT #${adjustments}: ${msg.reason}`);
    console.log('       params:', JSON.stringify(msg.params));
  } else if (msg.type === 'coaching') {
    console.log(`[e2e] coaching: ${msg.message}`);
  }
});

ws.on('error', (e) => { console.error('[e2e] WS error:', e.message); process.exit(2); });
