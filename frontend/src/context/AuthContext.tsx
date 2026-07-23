import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { signInWithPopup, type AuthError } from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "../config/firebase";
import * as authAPI from "../api/auth";
import { useLang } from "./LanguageContext";
import { resetStoredChatSession } from "../components/chat-assistant/chatSessionStorage";

export type UserRole = "user" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  language?: 'he' | 'en';
}

interface AuthResponse {
  token?: string;
  user?: User;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  signup: (name: string, email: string, password: string, language?: 'he' | 'en') => Promise<AuthResponse>;
  loginWithGoogle: () => Promise<AuthResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { setLang } = useLang();

  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("token")
  );

  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem("user");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const isAdmin = user?.role === "admin";

  // Sync the UI language to the user's saved preference whenever it changes
  // (login, signup, or hydrate from localStorage on first render).
  useEffect(() => {
    if (user?.language === 'he' || user?.language === 'en') {
      setLang(user.language);
    }
  }, [user?.language, setLang]);

  const resetClientSession = useCallback(() => {
    resetStoredChatSession();
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    resetClientSession();
  }, [resetClientSession]);

  // Auto-logout when token is expired — intercept 401 responses globally
  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const msUntilExpiry = payload.exp * 1000 - Date.now();
      if (msUntilExpiry <= 0) { logout(); return; }
      const t = setTimeout(logout, msUntilExpiry);
      return () => clearTimeout(t);
    } catch { logout(); }
  }, [token, logout]);

  const login = async (email: string, password: string) => {
    const data = await authAPI.login(email, password);

    if (data.token && data.user) {
      resetClientSession();
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
    }

    return data;
  };

  const signup = async (name: string, email: string, password: string, language?: 'he' | 'en') => {
    const data = await authAPI.signup(name, email, password, language);

    if (data.token && data.user) {
      resetClientSession();
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
    }

    return data;
  };

  const loginWithGoogle = async (): Promise<AuthResponse> => {
    if (!isFirebaseConfigured) {
      return {
        error:
          "Google sign-in isn't configured yet. Add the Firebase web keys to frontend/.env (see .env.example) and restart.",
      };
    }
    try {
      // Sign in with Google using Firebase
      const result = await signInWithPopup(auth, googleProvider);

      // Get the ID token from the signed-in user
      const idToken = await result.user.getIdToken();

      // Send the ID token to our backend for verification and JWT generation
      const data = await authAPI.googleAuth(idToken);

      if (data.token && data.user) {
        resetClientSession();
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
      }

      return data;
    } catch (error) {
      console.error("Google sign-in error:", error);
      const code = (error as AuthError)?.code;
      // Silent when the user simply closed/cancelled the popup.
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return {};
      }
      const messages: Record<string, string> = {
        "auth/operation-not-allowed":
          "Google sign-in is not enabled for this project. Enable it in Firebase Console → Authentication → Sign-in method → Google.",
        "auth/unauthorized-domain":
          "This domain isn't authorized for Google sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.",
        "auth/invalid-api-key":
          "The Firebase API key is invalid. Check VITE_FIREBASE_API_KEY in frontend/.env.",
        "auth/popup-blocked":
          "The sign-in popup was blocked by the browser. Allow popups for this site and try again.",
      };
      return { error: (code && messages[code]) || "Google sign-in failed. Please try again." };
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isAdmin, login, signup, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
