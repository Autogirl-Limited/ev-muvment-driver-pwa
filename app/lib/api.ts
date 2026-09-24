import type {
  ApiEnvelope,
  ChargeStats,
  DvaStats,
  FieldErrors,
  Paginated,
  PickupRequest,
  PickupRequestInput,
  TodayChecklists,
  WalletStats,
} from "./types";

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

export type DateRange = { from?: string; to?: string };

function rangeQuery({ from, to }: DateRange) {
  const params = new URLSearchParams();
  if (from) params.set("dateFrom", from);
  if (to) params.set("dateTo", to);
  const query = params.toString();
  return query ? `?${query}` : "";
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

  // Stats endpoints. Omit the range for all-time totals; dates are YYYY-MM-DD, inclusive.
  async dvaStats(range: DateRange) {
    return (await request<DvaStats>(`/dva-transactions/mine/stats${rangeQuery(range)}`)).data;
  },

  async walletStats() {
    return (await request<WalletStats>("/wallet-allocations/mine/stats")).data;
  },

  async chargeStats(range: DateRange) {
    return (await request<ChargeStats>(`/charge-sessions/mine/stats${rangeQuery(range)}`)).data;
  },

  async todayChecklists() {
    return (await request<TodayChecklists>("/daily-checklists/today")).data;
  },

  async myPickupRequests() {
    const params = new URLSearchParams({ page_size: "10" });
    return (await request<Paginated<PickupRequest>>(`/pickup-requests/mine?${params}`)).data?.items ?? [];
  },

  createPickupRequest: (body: PickupRequestInput) => post<PickupRequest>("/pickup-requests", body),

  // The proxy supplies the refresh token from the session cookie.
  logout: () => post<null>("/auth/logout"),
};
