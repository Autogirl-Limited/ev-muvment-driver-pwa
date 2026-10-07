import { NextRequest, NextResponse } from "next/server";
import {
  clearLoginChallenge,
  isTwoFactorMethod,
  readLoginChallenge,
  updateLoginChallengeMethod,
} from "../../lib/login-challenge";
import { BACKEND_URL } from "../../lib/server";
import type { ApiEnvelope, LoginChallenge, TwoFactorMethod } from "../../lib/types";

/**
 * The pending two-factor sign-in, minus its token (which stays in the httpOnly
 * cookie). GET reads it, POST switches method (or resends the email code when
 * called with the current method), DELETE abandons it.
 */

const respond = (status: number, message: string, data: LoginChallenge | null = null) =>
  NextResponse.json({ status: status < 400 ? "success" : "error", message, data, error: null }, { status });

const EXPIRED = "Your verification expired. Please sign in again.";

export async function GET() {
  const challenge = await readLoginChallenge();
  if (!challenge) return respond(404, EXPIRED);
  return respond(200, "Verification required", { method: challenge.method, available_methods: challenge.available_methods });
}

export async function POST(request: NextRequest) {
  const challenge = await readLoginChallenge();
  if (!challenge) return respond(401, EXPIRED);

  const body = (await request.json().catch(() => null)) as { method?: unknown } | null;
  if (!isTwoFactorMethod(body?.method)) return respond(422, "Choose a verification method.");

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/auth/login/two-factor-method`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge_token: challenge.token, method: body.method }),
      cache: "no-store",
    });
  } catch {
    return respond(502, "Unable to reach the server. Please try again.");
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<{
    two_factor_method: TwoFactorMethod | null;
    available_two_factor_methods: TwoFactorMethod[] | null;
  }> | null;
  if (!response.ok || !payload || payload.status === "error") {
    const message = payload?.message ?? "Unable to switch verification method.";
    // A dead challenge can't be revived; the page sends the driver back to the password step.
    if (message.toLowerCase().includes("login challenge")) {
      await clearLoginChallenge();
      return respond(401, EXPIRED);
    }
    return respond(response.status || 400, message);
  }

  const method = payload.data?.two_factor_method ?? body.method;
  const available = payload.data?.available_two_factor_methods ?? challenge.available_methods;
  await updateLoginChallengeMethod(method, available);
  return respond(200, payload.message, { method, available_methods: available });
}

export async function DELETE() {
  await clearLoginChallenge();
  return respond(200, "Cleared");
}
