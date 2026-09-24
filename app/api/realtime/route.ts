import { NextRequest, NextResponse } from "next/server";
import { readSessionToken } from "../../lib/access-token";
import { BACKEND_URL } from "../../lib/server";

/**
 * Hands the signed-in driver what the browser needs to open the live socket. Browsers can't set headers
 * on a WebSocket handshake, so the backend takes the access token as a query parameter instead.
 */
export async function GET(request: NextRequest) {
  const token = await readSessionToken(request);
  if (!token?.accessToken) return NextResponse.json({ message: "Not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const url = `${BACKEND_URL.replace(/^http/, "ws")}/notifications/ws`;
  return NextResponse.json({ url, token: token.accessToken }, { headers: { "Cache-Control": "no-store" } });
}
