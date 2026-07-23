import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase configuration for frontend (client-side)
// Get these values from Firebase Console -> Project Settings -> Your apps -> Web app
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: "neurostep-938fa.firebaseapp.com",
  projectId: "neurostep-938fa",
  storageBucket: "neurostep-938fa.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

// True only when the Firebase web config is actually filled in. Google sign-in
// cannot work without it — the UI uses this to fail loudly and helpfully.
export const isFirebaseConfigured =
  !!firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  !!firebaseConfig.appId;

if (!isFirebaseConfigured) {
  console.error(
    "[Firebase] Missing web config — Google sign-in is disabled.\n" +
      "Create frontend/.env from frontend/.env.example and set " +
      "VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID, VITE_FIREBASE_MESSAGING_SENDER_ID " +
      "(Firebase Console → Project settings → Your apps → Web app → Config), then restart the dev server.",
  );
}

// Initialize Firebase (prevent duplicate initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firebase Authentication
export const auth = getAuth(app);

export const db = getFirestore(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});

export default app;
