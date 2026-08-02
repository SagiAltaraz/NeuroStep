export async function signup(name: string, email: string, password: string, language?: 'he' | 'en') {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, language }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.message || "Signup failed" };
  }
  return data;
}

export async function login(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.message || "Login failed" };
  }
  return data;
}

export async function googleAuth(idToken: string) {
  const res = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.message || "Google authentication failed" };
  }
  return data;
}

export interface PersonalizationQuestionnaireEntry {
  questionId: number;
  questionHe: string;
  questionEn: string;
  subtitleHe: string;
  subtitleEn: string;
  selectedOptionIds: string[];
  answersHe: string[];
  answersEn: string[];
}

export async function savePersonalizationProfile(
  token: string,
  answers: Record<number, string>,
  prompt: string,
  questionnaire: PersonalizationQuestionnaireEntry[]
) {
  const res = await fetch("/api/personalization/profile/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ answers, prompt, questionnaire }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.message || "Failed to save profile" };
  }
  return data;
}

export async function getPersonalizationProfile(token: string) {
  const res = await fetch("/api/personalization/profile", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.message || "Failed to get profile" };
  }
  return data;
}
