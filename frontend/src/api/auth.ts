export async function signup(name: string, email: string, password: string) {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
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

export async function logout() {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.message || "Logout failed" };
  }
  return data;
}

export async function savePersonalizationProfile(
  token: string,
  answers: Record<number, string>,
  prompt: string
) {
  const res = await fetch("/api/personalization/profile/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ answers, prompt }),
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