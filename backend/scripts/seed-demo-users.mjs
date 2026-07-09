/**
 * seed-demo-users.mjs — populate Firestore with realistic demo players.
 *
 * Creates N users (default 150) that look like real customers with weeks of
 * training history: a per-domain cognitive profile, a journey-map progression,
 * per-game stats, and a time series of session reports (which drives the admin
 * Trends graph). Data is internally consistent — profile levels, progression
 * nodes and the latest reports all agree.
 *
 * SAFETY
 *   - Every demo user doc carries `demo: true` and a @demo.neurostep.app email,
 *     so seed-demo-clean.mjs can find and delete them (with subcollections).
 *   - Writes to whatever Firestore backend/.env points at — i.e. PRODUCTION.
 *     Run with --dry-run first to print a sample without writing anything.
 *
 * Usage:
 *   node backend/scripts/seed-demo-users.mjs --dry-run          # print sample, no writes
 *   node backend/scripts/seed-demo-users.mjs --count 150        # seed 150 users
 *   node backend/scripts/seed-demo-users.mjs --count 3          # small real batch
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const COUNT = Number(args[args.indexOf('--count') + 1]) || (DRY_RUN ? 2 : 150);

// ── Reference data (mirrors game-server/types/domains.ts) ────────────────────
const DOMAINS = [
  'working-memory', 'selective-attention', 'divided-attention', 'processing-speed',
  'reaction-time', 'response-inhibition', 'strategic-thinking', 'visual-spatial',
];
const GAME_DOMAINS = {
  'shapes-click':    { primary: 'response-inhibition', secondary: ['selective-attention', 'reaction-time'] },
  'color-trains':    { primary: 'divided-attention',   secondary: ['processing-speed', 'reaction-time'] },
  'tictactoe':       { primary: 'strategic-thinking',  secondary: ['working-memory', 'visual-spatial'] },
  'memory':          { primary: 'working-memory',      secondary: ['selective-attention', 'visual-spatial'] },
  'green-light':     { primary: 'reaction-time',       secondary: ['response-inhibition'] },
  'spot-difference': { primary: 'processing-speed',    secondary: ['selective-attention', 'visual-spatial'] },
  'where-was-it':    { primary: 'visual-spatial',      secondary: ['working-memory'] },
  'find-letter':     { primary: 'selective-attention', secondary: ['processing-speed'] },
};
const GAMES = Object.keys(GAME_DOMAINS);
const DOMAIN_HE = {
  'working-memory': 'הזיכרון', 'selective-attention': 'הקשב הממוקד',
  'divided-attention': 'הקשב המחולק', 'processing-speed': 'מהירות העיבוד',
  'reaction-time': 'זמן התגובה', 'response-inhibition': 'השליטה העצמית',
  'strategic-thinking': 'החשיבה האסטרטגית', 'visual-spatial': 'התפיסה המרחבית',
};

const FIRST = ['דוד','שרה','משה','רבקה','יוסי','מרים','אבי','חנה','יעקב','לאה','דניאל','נועה','איתי','תמר','עמית','מיכל','רון','שירה','גיל','אורית','בני','דנה','ניר','ליאת','עוז','יעל','אלון','הדס','ערן','גלית','צחי','ורד','אורי','סיגל','טל','רותם','נדב','קרן','אסף','מאיה','יונתן','ענת','שי','דפנה','ליאור','נטע','עידו','רוני','אמיר','אפרת'];
const LAST  = ['כהן','לוי','מזרחי','פרץ','ביטון','דהן','אברהם','פרידמן','אזולאי','מלכה','גבאי','אוחיון',' אשכנזי','חדד','בן דוד','שלום','אדרי','גולן','טל','ברק','נחום','שגב','רוזן',' שפירא','הראל','סבן','עמר','נגר',' מור','בן חיים'];

// ── Small helpers ────────────────────────────────────────────────────────────
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v) => Math.round(v);
const DAY = 24 * 60 * 60 * 1000;

// Player archetypes shape the whole history so trends look real.
const ARCHETYPES = [
  { name: 'improving',      w: 0.32, slope:  +1.6, base: [30, 55], sessions: [16, 40] },
  { name: 'stable',         w: 0.28, slope:  +0.2, base: [50, 72], sessions: [14, 38] },
  { name: 'high-performer', w: 0.12, slope:  +0.4, base: [74, 90], sessions: [24, 55] },
  { name: 'declining',      w: 0.10, slope:  -1.3, base: [55, 78], sessions: [18, 40] },
  { name: 'newcomer',       w: 0.18, slope:  +0.8, base: [35, 60], sessions:  [1,  5] },
];
const pickArchetype = () => {
  let r = Math.random();
  for (const a of ARCHETYPES) { if ((r -= a.w) <= 0) return a; }
  return ARCHETYPES[1];
};

function computeRank(overall) {
  if (overall <= 15) return 'beginner';
  if (overall <= 35) return 'explorer';
  if (overall <= 55) return 'advanced';
  if (overall <= 70) return 'expert';
  return 'champion';
}

const SUMMARIES = {
  strong:  (d) => `ביצוע מצוין, ${d} עבד נהדר`,
  average: (d) => `תרגול טוב ויציב, ${d} ממשיך להתחזק`,
  weak:    (d) => `כל הכבוד על ההתמדה, ${d} ישתפר בהדרגה`,
};
const summaryFor = (score, gameId) => {
  const d = DOMAIN_HE[GAME_DOMAINS[gameId].primary];
  return score >= 70 ? SUMMARIES.strong(d) : score >= 40 ? SUMMARIES.average(d) : SUMMARIES.weak(d);
};

// ── Build one user's full dataset ────────────────────────────────────────────
function buildUser(i) {
  const arch = pickArchetype();
  const first = pick(FIRST), last = pick(LAST);
  const name = `${first} ${last}`;
  const email = `demo.${i}@demo.neurostep.app`;

  const totalSessions = randInt(...arch.sessions);
  const spanDays = clamp(totalSessions * randInt(2, 5), 7, 200);
  const startedAt = Date.now() - spanDays * DAY;
  const createdAt = new Date(startedAt - randInt(0, 10) * DAY);

  // Per-session reports over time, score following the archetype trend + noise.
  const base = rand(...arch.base);
  const reports = [];
  const domainScoreHistory = Object.fromEntries(DOMAINS.map((d) => [d, []]));

  for (let s = 0; s < totalSessions; s++) {
    const t = totalSessions <= 1 ? 0 : s / (totalSessions - 1);
    const trendScore = base + arch.slope * (t * totalSessions);
    const score = round(clamp(trendScore + rand(-9, 9), 5, 99));
    const gameId = pick(GAMES);
    const { primary, secondary } = GAME_DOMAINS[gameId];
    const generatedAt = round(startedAt + t * spanDays * DAY + rand(-0.3, 0.3) * DAY);
    const accuracy = round(clamp(score + rand(-8, 8), 5, 99)) / 100;

    const domainScores = { [primary]: score };
    for (const sec of secondary) domainScores[sec] = round(score * 0.85);
    for (const [d, v] of Object.entries(domainScores)) domainScoreHistory[d].push({ v, t: generatedAt });

    reports.push({
      sessionId: `demo-${i}-s${s}`,
      gameId, cognitiveScore: score, domainScores,
      summaryHe: summaryFor(score, gameId),
      accuracy, generatedAt,
    });
  }

  // Cognitive profile per touched domain — smoothed level from its history.
  const profiles = {};
  for (const d of DOMAINS) {
    const hist = domainScoreHistory[d];
    if (hist.length === 0) continue;
    const recent = hist.slice(-5).map((h) => h.v);
    const ema = recent.reduce((a, b) => a + b, 0) / recent.length;
    const level = round(ema);
    const bestLevel = Math.max(level, round(Math.max(...hist.map((h) => h.v))));
    const first3 = hist.slice(0, 3).map((h) => h.v);
    const last3 = hist.slice(-3).map((h) => h.v);
    const delta = (last3.reduce((a, b) => a + b, 0) / last3.length) - (first3.reduce((a, b) => a + b, 0) / first3.length);
    const trend = delta >= 3 ? 'up' : delta <= -3 ? 'down' : 'stable';
    const confidence = clamp(hist.length / 5, 0.2, 1);
    const variance = recent.reduce((a, b) => a + (b - ema) ** 2, 0) / recent.length;
    const volatility = Math.round(Math.sqrt(variance) * 10) / 10;
    const deteriorationFlag = confidence >= 0.6 && bestLevel - level >= 8 && trend !== 'up';
    profiles[d] = {
      domainId: d, level, _ema: ema, confidence,
      sessionsCount: hist.length, trend, volatility,
      plateauCount: trend === 'stable' ? randInt(0, 4) : 0,
      deteriorationFlag, bestLevel, bestAt: hist[hist.length - 1].t,
      playstyleTags: [], lastPlayedAt: hist[hist.length - 1].t, updatedAt: Date.now(), v: 2,
    };
  }

  // Progression — node per domain from its level; overall = sum of 8 nodes.
  const regions = {};
  for (const d of DOMAINS) {
    const lvl = profiles[d]?.level ?? 0;
    const node = clamp(Math.floor(lvl / 10) + 1, 1, 10);
    regions[d] = { node, peakNode: node, graceLeft: 2, lastDelta: 0 };
  }
  const overallLevel = DOMAINS.reduce((s, d) => s + regions[d].node, 0);
  const progression = { overallLevel, rank: computeRank(overallLevel), regions, avatarState: 'idle', updatedAt: Date.now(), v: 1 };

  // Per-game stats for the games this user actually played.
  const playedGames = [...new Set(reports.map((r) => r.gameId))];
  const stats = {};
  for (const g of playedGames) {
    const avg = randInt(600, 2400);
    stats[g] = {
      avgReactionMs: avg, stdDevReactionMs: randInt(80, 400),
      difficultyLevel: Math.round(rand(0.2, 0.85) * 1000) / 1000,
      difficultyUpdatedAt: Date.now(),
    };
  }

  // Training plan — focus the two weakest touched domains.
  const touched = Object.values(profiles);
  const weakest = [...touched].sort((a, b) => a.level - b.level).slice(0, 2).map((p) => p.domainId);
  let recGames = GAMES.filter((g) => weakest.includes(GAME_DOMAINS[g].primary));
  for (const g of GAMES) { if (recGames.length >= 3) break; if (!recGames.includes(g)) recGames.push(g); }
  recGames = recGames.slice(0, 3);
  const trainingPlan = {
    focusDomains: weakest,
    recommendedGames: recGames,
    targetDifficulty: Object.fromEntries(recGames.map((g) => [g, Math.round(rand(0.3, 0.7) * 1000) / 1000])),
    weeklyGoal: `3 תרגולים השבוע עם דגש על ${weakest.map((d) => DOMAIN_HE[d]).join(' ו')}`,
    rationaleHe: `${weakest.map((d) => DOMAIN_HE[d]).join(' ו')} הם התחומים עם הכי הרבה מקום לצמיחה כרגע`,
    nextReviewAt: Date.now() + 7 * DAY, updatedAt: Date.now(), v: 1,
  };

  // Per-domain timeline (the long-term graph).
  const timeline = {};
  for (const [d, hist] of Object.entries(domainScoreHistory)) {
    if (!hist.length) continue;
    timeline[d] = {
      domainId: d, updatedAt: Date.now(), v: 2,
      points: hist.slice(-120).map((h) => ({ t: h.t, level: profiles[d].level, score: h.v, confidence: profiles[d].confidence })),
    };
  }

  // Longitudinal coach reports (every 5 sessions).
  const coachReports = [];
  const nCoach = Math.min(4, Math.floor(reports.length / 5));
  for (let k = 1; k <= nCoach; k++) {
    const upTo = reports.slice(0, k * 5);
    const avg = round(upTo.reduce((a, r) => a + r.cognitiveScore, 0) / upTo.length);
    const progress = arch.slope > 0.5 ? 'improving' : arch.slope < -0.5 ? 'needs_attention' : 'stable';
    coachReports.push({
      id: `demo-${i}-c${k}`, overallProgress: progress,
      summaryHe: progress === 'improving' ? 'לאורך התרגולים האחרונים רואים שיפור יפה ועקבי'
        : progress === 'needs_attention' ? 'כדאי לשים לב לכמה תחומים שירדו מעט לאחרונה'
        : 'הביצועים יציבים ועקביים לאורך זמן',
      highlightsHe: [`ממוצע ציון ${avg}`, `${upTo.length} תרגולים הושלמו`],
      recommendationsHe: ['להמשיך בתרגול קבוע', 'לגוון בין המשחקים'],
      cognitiveInsightHe: `${DOMAIN_HE[[...touched].sort((a, b) => b.level - a.level)[0]?.domainId] ?? 'היכולת'} בולט לחיוב`,
      generatedAt: upTo[upTo.length - 1].generatedAt,
    });
  }

  // The "prompts" layer — Director advice + the rendered prompt snapshot for the
  // latest session (only when there's enough history to be a milestone).
  let directorAdvice = null, promptSnapshot = null;
  if (reports.length >= 5) {
    const last = reports[reports.length - 1];
    directorAdvice = {
      sessionId: last.sessionId, gameId: last.gameId, generatedAt: last.generatedAt, v: 1,
      domainAssessment: weakest.map((d) => ({
        domainId: d,
        state: profiles[d].trend === 'up' ? 'improving' : profiles[d].trend === 'down' ? 'declining' : 'stable',
        recommendedDelta: profiles[d].trend === 'down' ? -1 : 1,
      })),
      difficultyPath: { direction: 'hold', chosenPath: 'hold', rationale: 'Player is inside the flow band.' },
      crossGame: { nextGame: recGames[0], reason: `Trains ${weakest[0]}, the current focus domain.` },
      trainingPlan: { focusDomains: weakest, weeklyGoal: '3 sessions this week' },
      userMessageHe: 'כל הכבוד, ממשיכים ככה',
    };
    promptSnapshot = {
      agent: 'director', modelVersion: 'claude-haiku-4-5-20251001',
      sessionId: last.sessionId, createdAt: last.generatedAt, v: 1,
      renderedPrompt: `## Player model\n${JSON.stringify({ game: last.gameId, focus: weakest, level: profiles[weakest[0]]?.level }, null, 2)}\n\n## Required JSON output\n{ "domainAssessment": [...], "difficultyPath": {...}, "crossGame": {...}, "trainingPlan": {...}, "userMessageHe": "..." }`,
    };
  }

  return {
    i, name, email, arch: arch.name, createdAt,
    reports, profiles, progression, stats,
    trainingPlan, timeline, coachReports, directorAdvice, promptSnapshot,
  };
}

// ── Firestore write ──────────────────────────────────────────────────────────
async function seed() {
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.error('Missing FIREBASE_* env (backend/.env). Aborting.');
    process.exit(1);
  }
  const app = getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  const db = getFirestore(app);

  console.log(`\n${DRY_RUN ? '🧪 DRY RUN' : '🚀 SEEDING'} — ${COUNT} demo users → project ${process.env.FIREBASE_PROJECT_ID}\n`);

  if (DRY_RUN) {
    for (let i = 0; i < COUNT; i++) {
      const u = buildUser(i);
      console.log(`── ${u.name} <${u.email}>  [${u.arch}]`);
      console.log(`   sessions: ${u.reports.length} | overallLevel: ${u.progression.overallLevel} (${u.progression.rank})`);
      console.log(`   domains: ${Object.entries(u.profiles).map(([d, p]) => `${d.split('-')[0]}:${p.level}${p.trend === 'up' ? '↑' : p.trend === 'down' ? '↓' : ''}`).join('  ')}`);
      console.log(`   first report score ${u.reports[0]?.cognitiveScore} → last ${u.reports.at(-1)?.cognitiveScore}\n`);
    }
    console.log('No data written (dry run). Re-run without --dry-run to seed.\n');
    return;
  }

  let batch = db.batch();
  let ops = 0;
  const commit = async () => { if (ops) { await batch.commit(); batch = db.batch(); ops = 0; } };

  const userDoc = (u) => {
    const doc = {
      name: u.name, email: u.email, role: 'user', language: 'he',
      demo: true, createdAt: u.createdAt, updatedAt: u.createdAt,
    };
    // Hard guard — a demo user must NEVER be an admin.
    if (doc.role !== 'user') throw new Error(`refusing to seed non-user role: ${doc.role}`);
    return doc;
  };

  for (let i = 0; i < COUNT; i++) {
    const u = buildUser(i);
    const userRef = db.collection('users').doc(); // auto id
    batch.set(userRef, userDoc(u)); ops++;

    for (const [d, p] of Object.entries(u.profiles)) {
      batch.set(userRef.collection('cognitiveProfile').doc(d), p); ops++;
    }
    batch.set(userRef.collection('progression').doc('current'), u.progression); ops++;
    batch.set(userRef.collection('trainingPlan').doc('current'), u.trainingPlan); ops++;
    for (const [g, st] of Object.entries(u.stats)) {
      batch.set(userRef.collection('stats').doc(g), st); ops++;
    }
    for (const [d, tl] of Object.entries(u.timeline)) {
      batch.set(userRef.collection('timeline').doc(d), tl); ops++;
    }
    for (const r of u.reports) {
      batch.set(userRef.collection('reports').doc(r.sessionId), {
        sessionId: r.sessionId, userId: userRef.id, gameId: r.gameId,
        cognitiveScore: r.cognitiveScore, domainScores: r.domainScores,
        summaryHe: r.summaryHe, accuracy: r.accuracy, generatedAt: r.generatedAt,
      }); ops++;
    }
    for (const c of u.coachReports) {
      batch.set(userRef.collection('coachReports').doc(c.id), { ...c, userId: userRef.id }); ops++;
    }
    if (u.directorAdvice) {
      batch.set(userRef.collection('directorAdvice').doc(u.directorAdvice.sessionId), u.directorAdvice); ops++;
    }
    if (u.promptSnapshot) {
      batch.set(userRef.collection('promptSnapshots').doc(u.promptSnapshot.sessionId), u.promptSnapshot); ops++;
    }
    if (ops >= 400) await commit();
    if ((i + 1) % 25 === 0) console.log(`  …${i + 1}/${COUNT} users staged`);
  }
  await commit();
  console.log(`\n✅ Seeded ${COUNT} demo users. Remove them any time with:\n   node backend/scripts/seed-demo-clean.mjs\n`);
}

seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
