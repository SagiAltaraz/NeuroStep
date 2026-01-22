export async function signup(name: string, email: string, password: string) {
  const res = await fetch("http://localhost:3000/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function logout() {
  const res = await fetch("http://localhost:3000/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function savePersonalizationProfile(
  token: string,
  answers: Record<number, string>,
  prompt: string
) {
  const res = await fetch("http://localhost:3000/api/personalization/profile/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ answers, prompt }),
  });
  return res.json();
}

export async function getPersonalizationProfile(token: string) {
  const res = await fetch("http://localhost:3000/api/personalization/profile", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.json();
}