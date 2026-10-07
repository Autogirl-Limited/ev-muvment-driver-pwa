import { cookies } from "next/headers";
import type { LoginChallenge, TwoFactorMethod } from "./types";

/**
 * Server-only: a sign-in waiting on a second factor. The backend's challenge
 * token sits in an httpOnly cookie so the browser never handles it; the page
 * only learns which method to ask for (see /api/login-challenge).
 */
const COOKIE = "ev_login_challenge";
// Matches the backend's challenge token lifetime.
const MAX_AGE_SECONDS = 10 * 60;

type StoredChallenge = LoginChallenge & { token: string };

const METHODS: TwoFactorMethod[] = ["EMAIL_OTP", "TOTP"];
const isMethod = (value: unknown): value is TwoFactorMethod => METHODS.includes(value as TwoFactorMethod);

export async function saveLoginChallenge(challenge: StoredChallenge) {
  (await cookies()).set(COOKIE, JSON.stringify(challenge), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readLoginChallenge(): Promise<StoredChallenge | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredChallenge>;
    if (typeof value.token !== "string" || !isMethod(value.method)) return null;
    const available = Array.isArray(value.available_methods) ? value.available_methods.filter(isMethod) : [];
    return { token: value.token, method: value.method, available_methods: available.length ? available : [value.method] };
  } catch {
    return null;
  }
}

/** Keeps the original expiry: switching method doesn't extend the backend's challenge either. */
export async function updateLoginChallengeMethod(method: TwoFactorMethod, available: TwoFactorMethod[]) {
  const current = await readLoginChallenge();
  if (current) await saveLoginChallenge({ ...current, method, available_methods: available });
}

export async function clearLoginChallenge() {
  (await cookies()).delete(COOKIE);
}

export { isMethod as isTwoFactorMethod };
