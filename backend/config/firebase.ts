import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  databaseURL: process.env.FIREBASE_DATABASE_URL
};

// אתחול Firebase
const app = initializeApp(firebaseConfig);

// Firestore - לפרומפטים ונתוני משתמשים
export const firestore = getFirestore(app);

// Realtime Database - לדאטה בזמן אמת של Kafka
export const realtimeDb = getDatabase(app);

export default app;
