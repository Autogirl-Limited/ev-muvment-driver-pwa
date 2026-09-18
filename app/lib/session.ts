import type { LoginResponse, User, VirtualAccount } from "./api-types";
import { ApiError } from "./api-client";

const SESSION_KEY = "muvment.driver.session";

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  user: User;
  virtualAccount?: VirtualAccount | null;
};

export function sessionFromLogin(response: LoginResponse): StoredSession {
  if (!response.access_token || !response.refresh_token || !response.user) {
    throw new ApiError(
      "Login response did not include a complete session.",
      500,
      "INVALID_LOGIN_RESPONSE",
    );
  }

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    user: response.user,
    virtualAccount: response.virtual_account ?? response.user.virtual_account ?? null,
  };
}

export function loadStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(SESSION_KEY);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as StoredSession;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveStoredSession(session: StoredSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
