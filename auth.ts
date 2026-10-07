import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { TWO_FACTOR_REQUIRED, type ApiEnvelope, type DriverProfile, type LoginData, type TwoFactorMethod } from "./app/lib/types";
import { clearLoginChallenge, readLoginChallenge, saveLoginChallenge } from "./app/lib/login-challenge";
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

type LoginResponse =
  | LoginData
  | {
      status: "two_factor_required";
      two_factor_method: TwoFactorMethod;
      available_two_factor_methods: TwoFactorMethod[] | null;
      challenge_token: string;
    };

async function callBackend(path: string, body: unknown): Promise<LoginResponse> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new LoginError("Unable to reach the server. Please try again.");
  }
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<LoginResponse> | null;
  if (!response.ok || !payload || payload.status === "error" || !payload.data) {
    throw new LoginError(payload?.message || "Unable to sign in");
  }
  return payload.data;
}

/** Step 1: password. A second factor parks the challenge in a cookie and asks the page for a code. */
async function passwordSignIn(identifier: unknown, password: unknown) {
  const data = await callBackend("/auth/login", { identifier, password });
  if (data.status === "two_factor_required") {
    await saveLoginChallenge({
      token: data.challenge_token,
      method: data.two_factor_method,
      available_methods: data.available_two_factor_methods ?? [data.two_factor_method],
    });
    throw new LoginError(TWO_FACTOR_REQUIRED);
  }
  await clearLoginChallenge();
  return data;
}

/** Step 2: the code, checked against whichever method the challenge is currently on. */
async function twoFactorSignIn(code: unknown) {
  const challenge = await readLoginChallenge();
  if (!challenge) throw new LoginError("Your verification expired. Please sign in again.");
  const path = challenge.method === "TOTP" ? "/auth/login/verify-totp" : "/auth/login/verify-email-otp";
  const data = await callBackend(path, { challenge_token: challenge.token, code });
  if (data.status !== "success") throw new LoginError("Unable to sign in");
  await clearLoginChallenge();
  return data;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {}, code: {} },
      async authorize(credentials) {
        const data = credentials?.code
          ? await twoFactorSignIn(credentials.code)
          : await passwordSignIn(credentials?.identifier, credentials?.password);
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
    async jwt({ token, user, trigger, session }) {
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
      // The client can ask for a fresh profile (shift, wallet balance, vehicle) but never supplies the data itself.
      if (trigger === "update" && session?.refreshProfile === true && token.accessToken && token.profile) {
        try {
          const response = await fetch(`${BACKEND_URL}/users/me`, {
            headers: { Authorization: `Bearer ${token.accessToken}` },
            cache: "no-store",
          });
          const payload = (await response.json()) as ApiEnvelope<LoginData["user"]>;
          if (response.ok && payload.data) {
            const fresh = payload.data;
            token.profile = {
              ...token.profile,
              user: { ...token.profile.user, ...fresh },
              vehicle: fresh.vehicle ?? null,
              virtual_account: fresh.virtual_account ?? token.profile.virtual_account,
            };
          }
        } catch {
          /* keep the profile we have; the next refresh will try again */
        }
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
