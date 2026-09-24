import { NextResponse } from "next/server";
import { auth } from "./auth";

const PUBLIC_PATHS = ["/login", "/apply", "/forgot-password"];

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const redirect = (to: string) => NextResponse.redirect(new URL(to, request.url));

  if (!session) return isPublic ? undefined : redirect("/login");
  if (!session.hasChangedTemporaryPassword) return pathname === "/change-password" ? undefined : redirect("/change-password");
  if (isPublic || pathname === "/change-password") return redirect("/");
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
