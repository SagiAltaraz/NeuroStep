import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

// Firebase Admin SDK - משתמש ב-Service Account
const existingApp = getApps()[0];

const app = existingApp ?? initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

// Firestore - לנתוני משתמשים
export const firestore = getFirestore(app);

// Realtime Database - לדאטה בזמן אמת (Kafka)
export const realtimeDb = getDatabase(app);

export default app;
