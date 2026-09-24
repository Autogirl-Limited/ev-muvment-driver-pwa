import type { ApiEnvelope, FieldErrors } from "./types";

export type { FieldErrors };

// Every call goes to our own /api/v1 proxy route, never straight to the backend.
const API_BASE = "/api/v1";

export class ApiError extends Error {
  statusCode: number;
  fieldErrors: FieldErrors;

  constructor(statusCode: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "You appear to be offline. Check your connection and try again.");
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!payload) throw new ApiError(response.status, "Unexpected response from the server.");

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

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  async suggestUsernames(firstName: string, lastName: string) {
    const params = new URLSearchParams({ first_name: firstName, last_name: lastName });
    const response = await request<{ suggestions: string[] }>(`/users/suggest-username?${params}`);
    return response.data?.suggestions ?? [];
  },

  async checkUsername(username: string) {
    const params = new URLSearchParams({ username });
    const response = await request<{ available: boolean }>(`/users/check-username?${params}`);
    return Boolean(response.data?.available);
  },

  submitApplication: (body: Record<string, unknown>) => post<Record<string, unknown>>("/driver-applications", body),

  forgotPassword: (identifier: string, channel: "SMS" | "EMAIL") => post<null>("/auth/forgot-password", { identifier, channel }),

  resetPassword: (identifier: string, code: string, newPassword: string) =>
    post<null>("/auth/reset-password", { identifier, code, new_password: newPassword }),

  // The proxy attaches the access token from the session cookie.
  changePassword: (currentPassword: string, newPassword: string) =>
    post<null>("/auth/change-password", { current_password: currentPassword, new_password: newPassword }),

  // The proxy supplies the refresh token from the session cookie.
  logout: () => post<null>("/auth/logout"),
};
