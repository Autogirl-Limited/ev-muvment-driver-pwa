import { NextRequest, NextResponse } from "next/server";
import { readSessionToken } from "../../../lib/access-token";
import { BACKEND_URL } from "../../../lib/server";

/**
 * Proxy for every backend call the app makes. The browser only ever talks to /api/v1/*;
 * the backend URL and the user's tokens stay on the server.
 */
const ROUTES: Record<string, { methods: string[]; auth?: boolean }> = {
  "users/suggest-username": { methods: ["GET"] },
  "users/check-username": { methods: ["GET"] },
  "driver-applications": { methods: ["POST"] },
  "auth/forgot-password": { methods: ["POST"] },
  "auth/reset-password": { methods: ["POST"] },
  "auth/change-password": { methods: ["POST"], auth: true },
  "auth/logout": { methods: ["POST"], auth: true },
  "dva-transactions/mine/stats": { methods: ["GET"], auth: true },
  "wallet-allocations/mine/stats": { methods: ["GET"], auth: true },
  "charge-sessions/mine/stats": { methods: ["GET"], auth: true },
  "daily-checklists/today": { methods: ["GET"], auth: true },
  "daily-checklists/start": { methods: ["POST"], auth: true },
  "daily-checklists/mine": { methods: ["GET"], auth: true },
  "pickup-requests": { methods: ["POST"], auth: true },
  "pickup-requests/mine": { methods: ["GET"], auth: true },
  "notifications": { methods: ["GET"], auth: true },
  "notifications/unread-count": { methods: ["GET"], auth: true },
  "notifications/read-all": { methods: ["POST"], auth: true },
  "users/me": { methods: ["GET"], auth: true },
};

/** Routes with an id in the path. */
const ID = "[0-9a-fA-F-]{36}";
const PATTERNS: [RegExp, { methods: string[]; auth?: boolean }][] = [
  [new RegExp(`^daily-checklists/${ID}$`), { methods: ["GET"], auth: true }],
  [new RegExp(`^daily-checklists/${ID}/(uploads|images|submit|reanalyze)$`), { methods: ["POST"], auth: true }],
  [new RegExp(`^daily-checklists/${ID}/dashboard$`), { methods: ["PATCH"], auth: true }],
  [new RegExp(`^notifications/${ID}/read$`), { methods: ["PATCH"], auth: true }],
];

const fail = (status: number, message: string) =>
  NextResponse.json({ status: "error", message, data: null, error: null }, { status });

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const key = path.join("/");
  const route = ROUTES[key] ?? PATTERNS.find(([pattern]) => pattern.test(key))?.[1];
  if (!route) return fail(404, "Not found");
  if (!route.methods.includes(request.method)) return fail(405, "Method not allowed");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let body = request.method === "GET" ? undefined : await request.text();

  if (route.auth) {
    const token = await readSessionToken(request);
    if (!token?.accessToken) return fail(401, "Your session has expired. Please sign in again.");
    headers.Authorization = `Bearer ${token.accessToken}`;
    if (key === "auth/logout") body = JSON.stringify({ refresh_token: token.refreshToken ?? "" });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/${key}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return fail(502, "Unable to reach the server. Please try again.");
  }
}

export { handle as GET, handle as POST, handle as PATCH };
