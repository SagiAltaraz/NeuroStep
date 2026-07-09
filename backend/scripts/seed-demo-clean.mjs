/**
 * seed-demo-clean.mjs — delete every demo user created by seed-demo-users.mjs.
 *
 * Finds users where `demo == true` and recursively deletes each user document
 * together with all of its subcollections (cognitiveProfile, progression,
 * stats, reports, timeline, …). Real users (no `demo` flag) are never touched.
 *
 * Usage:
 *   node backend/scripts/seed-demo-clean.mjs --dry-run   # count only, no deletes
 *   node backend/scripts/seed-demo-clean.mjs             # delete all demo users
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const DRY_RUN = process.argv.includes('--dry-run');

async function clean() {
  const app = getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  const db = getFirestore(app);

  const snap = await db.collection('users').where('demo', '==', true).get();
  console.log(`\nFound ${snap.size} demo users in project ${process.env.FIREBASE_PROJECT_ID}.`);

  if (DRY_RUN) {
    snap.docs.slice(0, 10).forEach((d) => console.log(`  · ${d.data().name} <${d.data().email}>`));
    if (snap.size > 10) console.log(`  … and ${snap.size - 10} more`);
    console.log('\nDry run — nothing deleted.\n');
    return;
  }

  let done = 0;
  for (const doc of snap.docs) {
    // recursiveDelete removes the doc AND all its subcollections.
    await db.recursiveDelete(doc.ref);
    if (++done % 25 === 0) console.log(`  …deleted ${done}/${snap.size}`);
  }
  console.log(`\n🧹 Deleted ${done} demo users (with all subcollections).\n`);
}

clean().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
