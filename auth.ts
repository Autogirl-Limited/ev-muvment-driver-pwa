import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { ApiEnvelope, DriverProfile, LoginData } from "./app/lib/types";
import { BACKEND_URL } from "./app/lib/server";

declare module "next-auth" {
  interface Session {
    hasChangedTemporaryPassword: boolean;
    profile: DriverProfile;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    hasChangedTemporaryPassword?: boolean;
    profile?: DriverProfile;
  }
}

/** Carries the backend's message to the client as the sign-in error `code`. */
class LoginError extends CredentialsSignin {
  constructor(message: string) {
    super(message);
    this.code = message;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {} },
      async authorize(credentials) {
        let response: Response;
        try {
          response = await fetch(`${BACKEND_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: credentials?.identifier, password: credentials?.password }),
            cache: "no-store",
          });
        } catch {
          throw new LoginError("Unable to reach the server. Please try again.");
        }

        const payload = (await response.json().catch(() => null)) as ApiEnvelope<LoginData> | null;
        if (!response.ok || !payload || payload.status === "error" || payload.data?.status !== "success") {
          throw new LoginError(payload?.message || "Unable to sign in");
        }

        const data = payload.data;
        return {
          id: data.user.id,
          name: `${data.user.first_name} ${data.user.last_name}`,
          email: data.user.email,
          // Extra fields are read by the jwt callback below.
          loginData: data,
        } as never;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        const data = (user as unknown as { loginData: LoginData }).loginData;
        token.accessToken = data.access_token;
        token.refreshToken = data.refresh_token;
        token.hasChangedTemporaryPassword = data.has_changed_temporary_password;
        token.profile = {
          has_changed_temporary_password: data.has_changed_temporary_password,
          dva_stats_date: data.dva_stats_date,
          dva_total_amount_received: data.dva_total_amount_received,
          dva_transaction_count: data.dva_transaction_count,
          user: data.user,
          virtual_account: data.virtual_account,
          vehicle: data.vehicle,
        };
      }
      // The client may only ever flip this flag to true (after a successful password change).
      if (trigger === "update" && session?.hasChangedTemporaryPassword === true) {
        token.hasChangedTemporaryPassword = true;
      }
      return token;
    },
    session({ session, token }) {
      session.hasChangedTemporaryPassword = Boolean(token.hasChangedTemporaryPassword);
      session.profile = token.profile as DriverProfile;
      return session;
    },
  },
});
