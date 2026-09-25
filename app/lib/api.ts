import type {
  ApiEnvelope,
  AppNotification,
  ChargeStats,
  ChecklistPhaseName,
  DailyChecklist,
  DashboardReading,
  DvaStats,
  FieldErrors,
  ImageType,
  Page,
  Paginated,
  PickupRequest,
  PickupRequestInput,
  TodayChecklists,
  UploadTarget,
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

  // ---- Notifications ----
  async notifications(page: number, unreadOnly: boolean) {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (unreadOnly) params.set("isRead", "false");
    return (await request<Page<AppNotification>>(`/notifications?${params}`)).data as Page<AppNotification>;
  },

  async unreadCount() {
    return (await request<{ unread_count: number }>("/notifications/unread-count")).data?.unread_count ?? 0;
  },

  markNotificationRead: (id: string) => request<AppNotification>(`/notifications/${id}/read`, { method: "PATCH" }),

  markAllNotificationsRead: () => post<null>("/notifications/read-all"),

  // ---- Daily checklist ----
  async myChecklists(page: number, phase: ChecklistPhaseName | null) {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (phase) params.set("phase", phase);
    return (await request<Page<DailyChecklist>>(`/daily-checklists/mine?${params}`)).data as Page<DailyChecklist>;
  },

  async startChecklist(phase: ChecklistPhaseName, position: Position) {
    return (await post<DailyChecklist>("/daily-checklists/start", { phase, ...position })).data as DailyChecklist;
  },

  async requestUpload(id: string, imageType: ImageType) {
    const body = { files: [{ image_type: imageType, content_type: "image/jpeg" }] };
    const targets = (await post<UploadTarget[]>(`/daily-checklists/${id}/uploads`, body)).data;
    if (!targets?.[0]) throw new ApiError(500, "Couldn't prepare the upload. Please try again.");
    return targets[0];
  },

  async registerImage(id: string, imageType: ImageType, objectKey: string) {
    const body = { image_type: imageType, object_key: objectKey };
    return (await post<DailyChecklist>(`/daily-checklists/${id}/images`, body)).data as DailyChecklist;
  },

  async submitChecklist(id: string, position: Position) {
    return (await post<DailyChecklist>(`/daily-checklists/${id}/submit`, position)).data as DailyChecklist;
  },

  async getChecklist(id: string) {
    return (await request<DailyChecklist>(`/daily-checklists/${id}`)).data as DailyChecklist;
  },

  async reanalyzeChecklist(id: string) {
    return (await post<DailyChecklist>(`/daily-checklists/${id}/reanalyze`)).data as DailyChecklist;
  },

  async updateDashboard(id: string, body: DashboardReading) {
    const response = await request<DailyChecklist>(`/daily-checklists/${id}/dashboard`, { method: "PATCH", body: JSON.stringify(body) });
    return response.data as DailyChecklist;
  },

  // The proxy supplies the refresh token from the session cookie.
  logout: () => post<null>("/auth/logout"),
};

export type Position = { latitude: number; longitude: number };

/**
 * PUTs the photo straight to cloud storage (not through our API). Sends exactly the signed headers
 * and no Authorization, and reports progress as 0..1.
 */
export function uploadToStorage(target: UploadTarget, blob: Blob, onProgress: (ratio: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method || "PUT", target.upload_url);
    for (const [name, value] of Object.entries(target.headers ?? {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(xhr.status, "The photo didn't upload. Check your connection and try again."));
    xhr.onerror = () => reject(new ApiError(0, "You appear to be offline. Check your connection and try again."));
    xhr.send(blob);
  });
}
