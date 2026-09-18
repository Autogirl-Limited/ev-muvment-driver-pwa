import type {
  GenericResponse,
  LoginRequest,
  LoginResponse,
  PaginatedResult,
  DriverNotification,
  User,
} from "./api-types";

const DEFAULT_API_BASE_URL = "https://ev-api-stag.up.railway.app";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

type ApiRequestOptions = {
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, boolean | number | string | null | undefined>;
  signal?: AbortSignal;
  token?: string | null;
};

export class ApiError extends Error {
  code?: string;
  details?: Record<string, string>[] | null;
  isNetworkError: boolean;
  statusCode: number;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    details?: Record<string, string>[] | null,
    isNetworkError = false,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.isNetworkError = isNetworkError;
    this.statusCode = statusCode;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      "Network connection lost. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
      null,
      true,
    );
  }

  const payload = await parsePayload<T>(response);

  if (!response.ok || payload.status === "error") {
    throw new ApiError(
      payload.message || "Something went wrong. Please try again.",
      response.status,
      payload.error?.code,
      payload.error?.details,
    );
  }

  return payload.data as T;
}

export function login(payload: LoginRequest) {
  return apiRequest<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function verifyEmailOtp(challengeToken: string, code: string) {
  return apiRequest<LoginResponse>("/api/v1/auth/login/verify-email-otp", {
    method: "POST",
    body: { challenge_token: challengeToken, code },
  });
}

export function verifyTotp(challengeToken: string, code: string) {
  return apiRequest<LoginResponse>("/api/v1/auth/login/verify-totp", {
    method: "POST",
    body: { challenge_token: challengeToken, code },
  });
}

export function refresh(refreshToken: string) {
  return apiRequest<LoginResponse>("/api/v1/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

export function logout(refreshToken: string) {
  return apiRequest<null>("/api/v1/auth/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

export function getMe(token: string) {
  return apiRequest<User>("/api/v1/users/me", { token });
}

export function listNotifications(token: string) {
  return apiRequest<PaginatedResult<DriverNotification>>(
    "/api/v1/notifications",
    {
      token,
      query: {
        page: 1,
        page_size: 10,
      },
    },
  );
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]) {
  const url = new URL(path, API_BASE_URL);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

async function parsePayload<T>(
  response: Response,
): Promise<GenericResponse<T>> {
  const text = await response.text();

  if (!text) {
    return {
      status: response.ok ? "success" : "error",
      message: response.statusText,
      data: null,
    };
  }

  try {
    return JSON.parse(text) as GenericResponse<T>;
  } catch {
    return {
      status: "error",
      message: response.statusText || "Unexpected server response.",
      data: null,
      error: { code: "INVALID_JSON" },
    };
  }
}
