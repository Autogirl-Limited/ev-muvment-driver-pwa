"use client";

type ApiEnvelope<T> = {
  status: "success" | "error";
  message: string;
  data: T | null;
  error: {
    code: string;
    details: { field: string; issue: string }[] | null;
  } | null;
};

export type LoginData = {
  status: "success";
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  has_changed_temporary_password: boolean;
  dva_stats_date: string | null;
  dva_total_amount_received: number | null;
  dva_transaction_count: number | null;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
    email: string | null;
    phone_number: string | null;
    ev_wallet_balance: number;
    shift: boolean;
    virtual_account?: VirtualAccount | null;
    vehicle?: Vehicle | null;
  };
  virtual_account: VirtualAccount | null;
  vehicle: Vehicle | null;
};

export type VirtualAccount = {
  account_name: string;
  account_number: string;
  bank_name: string;
  currency: string;
  status: string;
  banks?: { bank_name: string; account_number: string }[];
};

export type Vehicle = {
  name: string;
  plate_number: string;
  location_state: string;
  vehicle_make?: { name: string };
  vehicle_model?: { name: string };
  pick_up_window?: { start_time: string; end_time: string } | null;
  drop_off_window?: { start_time: string; end_time: string } | null;
};

export type FieldErrors = Record<string, string>;

const API_BASE = `${(process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "")}/api/v1`;
const SESSION_KEY = "ev_muvment_driver_session";
const TEMP_PASSWORD_KEY = "ev_muvment_temp_password";

export class ApiError extends Error {
  statusCode: number;
  fieldErrors: FieldErrors;

  constructor(statusCode: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || payload.status === "error") {
    const details = payload.error?.details ?? [];
    const fieldErrors = details.reduce<FieldErrors>((acc, item) => {
      acc[item.field] = item.issue;
      return acc;
    }, {});
    throw new ApiError(response.status, payload.message, fieldErrors);
  }

  return payload;
}

export function getSession(): LoginData | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as LoginData) : null;
}

export function saveSession(data: LoginData) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(TEMP_PASSWORD_KEY);
}

export function saveTemporaryPassword(password: string) {
  window.sessionStorage.setItem(TEMP_PASSWORD_KEY, password);
}

export function getTemporaryPassword() {
  return window.sessionStorage.getItem(TEMP_PASSWORD_KEY) ?? "";
}

export function clearTemporaryPassword() {
  window.sessionStorage.removeItem(TEMP_PASSWORD_KEY);
}

export async function suggestUsernames(firstName: string, lastName: string) {
  const params = new URLSearchParams({ first_name: firstName, last_name: lastName });
  const response = await request<{ suggestions: string[] }>(
    `/users/suggest-username?${params}`,
  );
  return response.data?.suggestions ?? [];
}

export async function checkUsername(username: string) {
  const params = new URLSearchParams({ username });
  const response = await request<{ available: boolean }>(
    `/users/check-username?${params}`,
  );
  return Boolean(response.data?.available);
}

export async function submitApplication(body: Record<string, unknown>) {
  return request<Record<string, unknown>>("/driver-applications", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function login(identifier: string, password: string) {
  const response = await request<LoginData>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  if (!response.data || response.data.status !== "success") {
    throw new ApiError(401, response.message || "Unable to sign in");
  }
  saveSession(response.data);
  return response.data;
}

export async function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
) {
  return request<null>("/auth/change-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export async function forgotPassword(identifier: string, channel: "SMS" | "EMAIL") {
  return request<null>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ identifier, channel }),
  });
}

export async function resetPassword(
  identifier: string,
  code: string,
  newPassword: string,
) {
  return request<null>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ identifier, code, new_password: newPassword }),
  });
}

export async function logout(refreshToken: string | undefined) {
  await request<null>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken ?? "" }),
  }).catch(() => null);
  clearSession();
}

// One-shot message carried across a route change (e.g. "Password reset").
const FLASH_KEY = "ev_muvment_flash";
export type FlashNotice = { text: string; tone: "success" | "error" | "info" };

export function setFlash(notice: FlashNotice) {
  window.sessionStorage.setItem(FLASH_KEY, JSON.stringify(notice));
}

export function takeFlash(): FlashNotice | null {
  const raw = window.sessionStorage.getItem(FLASH_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(FLASH_KEY);
  return JSON.parse(raw) as FlashNotice;
}
