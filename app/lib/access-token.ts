import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/** Server-only: reads the driver's tokens out of the encrypted session cookie. */
export async function readSessionToken(request: NextRequest) {
  const secure = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")) === "https";
  return getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: secure,
    salt: `${secure ? "__Secure-" : ""}authjs.session-token`,
  });
}
