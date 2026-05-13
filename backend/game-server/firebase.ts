/**
 * Shared Firebase Admin initializer.
 * Called from any agent — safe to call multiple times (guarded by getApps()).
 */

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore }  from 'firebase-admin/firestore';

let _db: Firestore | null = null;

export function getDb(): Firestore {
  if (_db) return _db;
  if (getApps().length === 0) {
    initializeApp({ credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })});
  }
  _db = getFirestore();
  return _db;
}
