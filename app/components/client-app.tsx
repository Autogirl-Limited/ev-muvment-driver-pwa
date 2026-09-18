"use client";

import Image from "next/image";
import {
  createContext,
  type FormEvent,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ApiError,
  apiRequest,
  getMe,
  listNotifications,
  login as loginRequest,
  logout as logoutRequest,
  refresh as refreshRequest,
  verifyEmailOtp,
  verifyTotp,
} from "@/app/lib/api-client";
import type {
  DriverNotification,
  LoginResponse,
  User,
  VirtualAccount,
} from "@/app/lib/api-types";
import { mockHomeDashboard } from "@/app/lib/mock-dashboard";
import {
  loadQueuedActions,
  queueDriverAction,
  removeQueuedAction,
  type QueuedDriverAction,
} from "@/app/lib/offline-queue";
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
  sessionFromLogin,
  type StoredSession,
} from "@/app/lib/session";

type AuthStatus = "authenticated" | "loading" | "unauthenticated";
type Tab = "home" | "activity" | "charging" | "payments" | "profile";

type LoginOutcome =
  | { status: "success" }
  | {
      challengeToken: string;
      method: "EMAIL_OTP" | "TOTP";
      status: "two_factor_required";
    };

type AuthContextValue = {
  accessToken: string | null;
  authRequest: <T>(
    path: string,
    options?: {
      body?: unknown;
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      query?: Record<string, boolean | number | string | null | undefined>;
    },
  ) => Promise<T>;
  login: (identifier: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<StoredSession>;
  status: AuthStatus;
  user: User | null;
  verifyLoginCode: (
    challengeToken: string,
    method: "EMAIL_OTP" | "TOTP",
    code: string,
  ) => Promise<void>;
  virtualAccount: VirtualAccount | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function DriverPwaApp() {
  return (
    <AuthProvider>
      <PwaRuntime />
      <AppShell />
    </AuthProvider>
  );
}

function AuthProvider({ children }: PropsWithChildren) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccount | null>(
    null,
  );
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<StoredSession> | null>(null);

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    setAccessToken(null);
    setUser(null);
    setVirtualAccount(null);
    setStatus("unauthenticated");
    clearStoredSession();
  }, []);

  const applySession = useCallback((session: StoredSession) => {
    accessTokenRef.current = session.accessToken;
    refreshTokenRef.current = session.refreshToken;
    setAccessToken(session.accessToken);
    setUser(session.user);
    setVirtualAccount(session.virtualAccount ?? session.user.virtual_account ?? null);
    setStatus("authenticated");
    saveStoredSession(session);
  }, []);

  const refreshSession = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const token = refreshTokenRef.current;
    if (!token) {
      throw new ApiError("No refresh token is available.", 401, "NO_REFRESH_TOKEN");
    }

    refreshPromiseRef.current = refreshRequest(token)
      .then((response) => {
        const nextSession = sessionFromLogin(response);
        applySession(nextSession);
        return nextSession;
      })
      .catch((error: unknown) => {
        clearSession();
        throw error;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    return refreshPromiseRef.current;
  }, [applySession, clearSession]);

  const authRequest = useCallback<AuthContextValue["authRequest"]>(
    async (path, options = {}) => {
      const token = accessTokenRef.current;
      if (!token) {
        throw new ApiError("Please sign in to continue.", 401, "UNAUTHENTICATED");
      }

      try {
        return await apiRequest(path, { ...options, token });
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 401) {
          const refreshedSession = await refreshSession();
          return apiRequest(path, {
            ...options,
            token: refreshedSession.accessToken,
          });
        }

        throw error;
      }
    },
    [refreshSession],
  );

  useEffect(() => {
    queueMicrotask(() => {
      const session = loadStoredSession();

      if (!session) {
        setStatus("unauthenticated");
        return;
      }

      accessTokenRef.current = session.accessToken;
      refreshTokenRef.current = session.refreshToken;
      setAccessToken(session.accessToken);
      setUser(session.user);
      setVirtualAccount(session.virtualAccount ?? session.user.virtual_account ?? null);
      setStatus("authenticated");

      getMe(session.accessToken)
        .then((profile) => {
          const nextSession = {
            ...session,
            user: profile,
            virtualAccount: profile.virtual_account ?? session.virtualAccount ?? null,
          };
          applySession(nextSession);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.statusCode === 401) {
            void refreshSession();
          }
        });
    });
  }, [applySession, refreshSession]);

  const login = useCallback(
    async (identifier: string, password: string): Promise<LoginOutcome> => {
      const response = await loginRequest({ identifier, password });

      if (response.status === "two_factor_required") {
        if (!response.challenge_token || !response.two_factor_method) {
          throw new ApiError(
            "Two-factor challenge is missing required details.",
            500,
            "INVALID_2FA_RESPONSE",
          );
        }

        return {
          challengeToken: response.challenge_token,
          method: response.two_factor_method,
          status: "two_factor_required",
        };
      }

      applySession(sessionFromLogin(response));
      return { status: "success" };
    },
    [applySession],
  );

  const verifyLoginCode = useCallback(
    async (
      challengeToken: string,
      method: "EMAIL_OTP" | "TOTP",
      code: string,
    ) => {
      const response: LoginResponse =
        method === "EMAIL_OTP"
          ? await verifyEmailOtp(challengeToken, code)
          : await verifyTotp(challengeToken, code);

      applySession(sessionFromLogin(response));
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    const token = refreshTokenRef.current;

    try {
      if (token) {
        await logoutRequest(token);
      }
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      authRequest,
      login,
      logout,
      refreshSession,
      status,
      user,
      verifyLoginCode,
      virtualAccount,
    }),
    [
      accessToken,
      authRequest,
      login,
      logout,
      refreshSession,
      status,
      user,
      verifyLoginCode,
      virtualAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}

function PwaRuntime() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setIsOffline(!navigator.onLine));

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-[#1F2937] px-4 py-2 text-center text-sm font-medium text-white">
      Offline mode. Cached screens remain available and queued actions will retry
      when the connection returns.
    </div>
  );
}

function AppShell() {
  const { status } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("home");

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F8FB] px-6">
        <div className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4 text-sm text-[#69718C]">
          Loading driver session...
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return <LoginScreen />;
  }

  return (
    <main className="min-h-screen bg-[#F6F8FB] pb-24 text-[#1F2937]">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col px-4 pt-8">
        {activeTab === "home" ? <HomeScreen /> : null}
        {activeTab === "activity" ? <ActivityScreen /> : null}
        {activeTab === "charging" ? <ChargingScreen /> : null}
        {activeTab === "payments" ? <PaymentsScreen /> : null}
        {activeTab === "profile" ? <ProfileScreen /> : null}
      </div>
      <BottomTabs activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  );
}

function LoginScreen() {
  const { login, verifyLoginCode } = useAuth();
  const [challenge, setChallenge] = useState<{
    challengeToken: string;
    method: "EMAIL_OTP" | "TOTP";
  } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (challenge) {
        await verifyLoginCode(challenge.challengeToken, challenge.method, code.trim());
        return;
      }

      const outcome = await login(identifier.trim(), password);
      if (outcome.status === "two_factor_required") {
        setChallenge({
          challengeToken: outcome.challengeToken,
          method: outcome.method,
        });
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-[#1F2937]">
      <form className="w-full max-w-[420px]" onSubmit={handleSubmit}>
        <div className="mb-16 text-center">
          <h1 className="text-[31px] font-bold leading-9">muvment</h1>
          <p className="mt-2 text-base font-medium text-[#69718C]">
            Professional Driver Portal
          </p>
        </div>

        <div className="space-y-4">
          <Field
            autoComplete="email"
            label="Email Address"
            onChange={setIdentifier}
            placeholder="NobertAutogirl@gmail.com"
            type="email"
            value={identifier}
          />
          <Field
            autoComplete="current-password"
            label="Password"
            onChange={setPassword}
            placeholder="Enter password"
            type="password"
            value={password}
          />

          {challenge ? (
            <Field
              autoComplete="one-time-code"
              label={challenge.method === "EMAIL_OTP" ? "Email OTP Code" : "Authenticator Code"}
              onChange={setCode}
              placeholder={
                challenge.method === "EMAIL_OTP"
                  ? "Enter emailed code"
                  : "Enter 6-digit code"
              }
              type="text"
              value={code}
            />
          ) : null}

          {error ? <p className="text-sm font-medium text-[#DC2626]">{error}</p> : null}

          <button
            className="min-h-12 w-full rounded-lg bg-[#0673FF] px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              isSubmitting ||
              !identifier.trim() ||
              (!challenge && !password) ||
              Boolean(challenge && !code.trim())
            }
            type="submit"
          >
            {isSubmitting ? "Please wait..." : challenge ? "Verify Code" : "Sign In"}
          </button>
          <button
            className="min-h-12 w-full rounded-lg border border-[#E5E7EB] bg-white px-4 py-3 text-base font-semibold text-[#1F2937]"
            type="button"
          >
            Become a Driver
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({
  autoComplete,
  label,
  onChange,
  placeholder,
  type,
  value,
}: {
  autoComplete?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#1F2937]">{label}</span>
      <input
        autoComplete={autoComplete}
        className="min-h-12 w-full rounded-lg border border-[#E5E7EB] bg-white px-4 text-base outline-none transition focus:border-[#0673FF] focus:ring-2 focus:ring-[#EAF3FF]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function HomeScreen() {
  const { user } = useAuth();
  const { driver, shift } = mockHomeDashboard;
  const [queue, setQueue] = useSyncedQueue();
  const firstName = user?.first_name ?? driver.firstName;
  const vehicle = shift.vehicle;

  const handleDropoff = () => {
    const queued = queueDriverAction({
      method: "POST",
      path: `/api/v1/driver/shifts/${shift.id}/drop-off`,
      title: "Start drop-off",
      body: { shift_id: shift.id },
    });
    setQueue((current) => [...current, queued]);
  };

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#69718C]">Driver PWA</p>
          <h2 className="mt-1 text-2xl font-semibold">Good morning, {firstName}</h2>
        </div>
        <button className="relative h-11 w-11 rounded-lg border border-[#E5E7EB] bg-white text-sm font-semibold">
          N
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#DC2626]" />
        </button>
      </header>

      <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
        <p className="text-sm text-[#69718C]">Current vehicle</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">{vehicle?.model ?? "No vehicle"}</h3>
            <p className="text-sm text-[#69718C]">
              {vehicle?.code} / {vehicle?.plateNumber}
            </p>
          </div>
          <span className="rounded-full bg-[#F0FDF4] px-3 py-1 text-sm font-medium text-[#16A34A]">
            Active
          </span>
        </div>
        <Image
          alt="Assigned sedan"
          className="mt-4 h-auto w-full"
          height={327}
          priority
          src="/sedan.png"
          width={640}
        />
      </div>

      <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[#69718C]">Today&apos;s shift</p>
            <h3 className="text-xl font-semibold">On shift</h3>
          </div>
          <span className="rounded-full bg-[#EAF3FF] px-3 py-1 text-sm font-medium text-[#0673FF]">
            07h 43m left
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InfoCell label="Pickup window" value="5:00 AM - 7:00 AM" />
          <InfoCell label="Started" value="6:17 AM" />
          <InfoCell label="Expected end" value="6:17 PM" />
          <InfoCell label="Final deadline" value="11:00 PM" />
        </div>
        <button
          className="mt-4 min-h-12 w-full rounded-lg bg-[#0673FF] px-4 py-3 font-semibold text-white"
          onClick={handleDropoff}
          type="button"
        >
          Start Drop-off
        </button>
        {queue.length ? (
          <p className="mt-3 text-sm font-medium text-[#D97706]">
            {queue.length} driver action queued for retry.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Battery" value="72%" helper="34 min left" />
        <MetricCard label="Range" value="280" helper="km left" />
        <MetricCard label="Allowance" value="8.2" helper="kWh left" />
        <MetricCard label="Shift" value="On" helper="Status locked" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Needs attention</h3>
          <span className="text-sm font-medium text-[#0673FF]">View all</span>
        </div>
        {shift.alerts.map((alert) => (
          <div
            className="rounded-lg border border-[#E5E7EB] bg-white p-4"
            key={alert.id}
          >
            <p className="font-semibold">{alert.title}</p>
            <p className="mt-1 text-sm text-[#69718C]">{alert.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivityScreen() {
  const shifts = [
    {
      id: "shift_today",
      date: "Today",
      vehicle: "MUV-EV-014",
      status: "Completed",
      time: "6:17 AM - 5:58 PM",
      distance: "147 km",
    },
    {
      id: "shift_yesterday",
      date: "15 Sep",
      vehicle: "MUV-EV-009",
      status: "Completed",
      time: "5:51 AM - 5:42 PM",
      distance: "132 km",
    },
    {
      id: "shift_overdue",
      date: "14 Sep",
      vehicle: "MUV-EV-009",
      status: "Overdue",
      time: "6:24 AM - 7:03 PM",
      distance: "156 km",
    },
  ];

  return (
    <section className="space-y-5">
      <ScreenHeader
        title="Activity"
        subtitle="Previous shifts and immutable shift summaries."
      />
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
        <p className="text-sm text-[#69718C]">This week</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <InfoCell label="Shifts" value="5" />
          <InfoCell label="Distance" value="684 km" />
          <InfoCell label="Charging" value="127 kWh" />
        </div>
      </div>
      <div className="space-y-3">
        {shifts.map((shift) => (
          <div
            className="rounded-lg border border-[#E5E7EB] bg-white p-4"
            key={shift.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-[#69718C]">{shift.date}</p>
                <p className="text-lg font-semibold">{shift.vehicle}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  shift.status === "Overdue"
                    ? "bg-[#FEF2F2] text-[#DC2626]"
                    : "bg-[#F0FDF4] text-[#16A34A]"
                }`}
              >
                {shift.status}
              </span>
            </div>
            <div className="mt-4 flex justify-between gap-3 text-sm text-[#69718C]">
              <span>{shift.time}</span>
              <span>{shift.distance}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChargingScreen() {
  const { shift } = mockHomeDashboard;
  const usedPercent = Math.round(
    (shift.charging.usedKwh / shift.charging.allowanceKwh) * 100,
  );

  return (
    <section className="space-y-5">
      <ScreenHeader title="Charging" subtitle="Today's allowance and charging activity." />
      <Image
        alt="Electric sedan"
        className="h-auto w-full"
        height={387}
        src="/electric-sedan.png"
        width={640}
      />
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[#69718C]">Charging used</p>
            <p className="text-3xl font-semibold">
              {shift.charging.usedKwh.toFixed(1)} kWh
            </p>
          </div>
          <p className="text-2xl font-semibold">{usedPercent}%</p>
        </div>
        <div className="mt-4 h-10 overflow-hidden rounded-lg bg-[#F0F1F3]">
          <div
            className="h-full rounded-lg bg-[#2FC866]"
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <InfoCell label="Allowance" value={`${shift.charging.allowanceKwh} kWh`} />
          <InfoCell
            label="Remaining"
            value={`${shift.charging.remainingKwh.toFixed(1)} kWh`}
          />
          <InfoCell label="Status" value="Normal" />
        </div>
      </div>
      <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-4">
        <p className="font-semibold">Payment instructions</p>
        <p className="mt-2 text-sm text-[#69718C]">
          If your charging allowance is exceeded, payment instructions will
          appear here from Muvment.
        </p>
      </div>
    </section>
  );
}

function PaymentsScreen() {
  const paymentResults = [
    { id: "txn_001", amount: 18500, payer: "John Doe", time: "Today, 3:42 PM", date: "2026-09-16" },
    { id: "txn_002", amount: 7200, payer: "Amina Yusuf", time: "Today, 12:16 PM", date: "2026-09-16" },
    { id: "txn_003", amount: 18500, payer: "Tomi Ade", time: "15 Sep, 5:08 PM", date: "2026-09-15" },
  ];
  const [amount, setAmount] = useState("18500");
  const [mode, setMode] = useState<"amount" | "date">("amount");
  const [hasSearched, setHasSearched] = useState(false);
  const normalizedAmount = Number(amount.replace(/[^\d]/g, ""));
  const results = hasSearched
    ? paymentResults.filter((payment) =>
        mode === "amount"
          ? normalizedAmount > 0 && payment.amount === normalizedAmount
          : payment.date >= "2026-09-15" && payment.date <= "2026-09-16",
      )
    : paymentResults.slice(0, 2);

  return (
    <section className="space-y-5">
      <ScreenHeader
        title="Payment Lookup"
        subtitle="Search read-only transactions for your assigned vehicle."
      />
      <div className="grid grid-cols-2 rounded-lg bg-[#EEF2F6] p-1">
        {(["amount", "date"] as const).map((option) => (
          <button
            className={`min-h-10 rounded-md text-sm font-medium ${
              mode === option ? "bg-white text-[#1F2937]" : "text-[#69718C]"
            }`}
            key={option}
            onClick={() => {
              setMode(option);
              setHasSearched(false);
            }}
            type="button"
          >
            {option[0].toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
        {mode === "amount" ? (
          <Field
            label="Amount"
            onChange={setAmount}
            placeholder="18500"
            type="text"
            value={amount}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <InfoCell label="From" value="2026-09-15" />
            <InfoCell label="To" value="2026-09-16" />
          </div>
        )}
        <button
          className="mt-4 min-h-12 w-full rounded-lg bg-[#0673FF] px-4 py-3 font-semibold text-white"
          onClick={() => setHasSearched(true)}
          type="button"
        >
          Search
        </button>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Results</h3>
        <span className="text-sm text-[#69718C]">{results.length} found</span>
      </div>
      <div className="space-y-3">
        {results.length ? (
          results.map((result) => (
            <div
              className="flex items-center justify-between gap-4 rounded-lg border border-[#E5E7EB] bg-white p-4"
              key={result.id}
            >
              <div>
                <p className="text-2xl font-semibold">
                  NGN {result.amount.toLocaleString("en-NG")}
                </p>
                <p className="text-sm text-[#69718C]">{result.payer}</p>
              </div>
              <p className="text-right text-sm text-[#69718C]">{result.time}</p>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
            <p className="font-semibold">No matching transaction</p>
            <p className="mt-1 text-sm text-[#69718C]">
              We could not find a transaction matching your search.
            </p>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-4">
        <p className="font-semibold">Read-only lookup</p>
        <p className="mt-1 text-sm text-[#69718C]">
          Drivers can search received transactions only. Confirmation and
          settlement actions stay outside this app.
        </p>
      </div>
    </section>
  );
}

function ProfileScreen() {
  const { accessToken, logout, user, virtualAccount } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const initials = `${user?.first_name?.[0] ?? "D"}${user?.last_name?.[0] ?? "R"}`.toUpperCase();

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    listNotifications(accessToken)
      .then((result) => setNotifications(result.items))
      .catch(() => setNotifications([]));
  }, [accessToken]);

  async function handleLogout() {
    setLogoutError("");
    setIsLoggingOut(true);

    try {
      await logout();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Unable to log out.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <section className="space-y-5">
      <ScreenHeader title="Profile" subtitle="Driver account and app settings." />
      <div className="flex items-center gap-4 rounded-lg border border-[#E5E7EB] bg-white p-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF3FF] text-xl font-semibold text-[#0673FF]">
          {initials}
        </div>
        <div>
          <h3 className="text-xl font-semibold">
            {user ? `${user.first_name} ${user.last_name}` : "Driver"}
          </h3>
          <p className="text-sm text-[#69718C]">{user?.username ?? "Signed in"}</p>
        </div>
      </div>
      <div className="divide-y divide-[#E5E7EB] rounded-lg border border-[#E5E7EB] bg-white">
        <DetailRow label="Phone" value={user?.phone_number ?? "Not available"} />
        <DetailRow label="Email" value={user?.email ?? "Not available"} />
        <DetailRow label="Role" value={user?.user_type ?? "Not available"} />
        <DetailRow
          label="Wallet Balance"
          value={`NGN ${(user?.ev_wallet_balance ?? 0).toLocaleString("en-NG")}`}
        />
        <DetailRow
          label="Virtual Account"
          value={
            virtualAccount
              ? `${virtualAccount.bank_name} / ${virtualAccount.account_number}`
              : "Not assigned"
          }
        />
      </div>
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Notifications</h3>
          <span className="text-sm text-[#69718C]">{notifications.length} loaded</span>
        </div>
        <div className="mt-3 space-y-3">
          {notifications.slice(0, 3).map((notification) => (
            <div className="rounded-lg bg-[#F8FAFC] p-3" key={notification.id}>
              <p className="text-sm font-semibold">{notification.title}</p>
              <p className="mt-1 text-sm text-[#69718C]">{notification.description}</p>
            </div>
          ))}
          {!notifications.length ? (
            <p className="text-sm text-[#69718C]">
              Notifications will appear here when available.
            </p>
          ) : null}
        </div>
      </div>
      {logoutError ? <p className="text-sm font-medium text-[#DC2626]">{logoutError}</p> : null}
      <button
        className="min-h-12 w-full rounded-lg border border-[#E5E7EB] bg-white px-4 py-3 font-semibold text-[#1F2937] disabled:opacity-50"
        disabled={isLoggingOut}
        onClick={handleLogout}
        type="button"
      >
        {isLoggingOut ? "Logging out..." : "Logout"}
      </button>
    </section>
  );
}

function BottomTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const tabs: { label: string; tab: Tab }[] = [
    { label: "Home", tab: "home" },
    { label: "Activity", tab: "activity" },
    { label: "Charging", tab: "charging" },
    { label: "Payments", tab: "payments" },
    { label: "Profile", tab: "profile" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-[#E5E7EB] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-[820px] grid-cols-5 gap-1">
        {tabs.map((item) => (
          <button
            className={`min-h-12 rounded-lg px-1 text-xs font-semibold ${
              activeTab === item.tab
                ? "bg-[#EAF3FF] text-[#0673FF]"
                : "text-[#69718C]"
            }`}
            key={item.tab}
            onClick={() => onTabChange(item.tab)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFB] p-3">
      <p className="text-xs text-[#69718C]">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function MetricCard({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
      <p className="text-sm text-[#69718C]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="text-sm text-[#69718C]">{helper}</p>
    </div>
  );
}

function ScreenHeader({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <header>
      <h2 className="text-3xl font-semibold">{title}</h2>
      <p className="mt-2 text-[15px] leading-6 text-[#69718C]">{subtitle}</p>
    </header>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4">
      <p className="text-sm text-[#69718C]">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function useSyncedQueue() {
  const [queue, setQueue] = useState<QueuedDriverAction[]>([]);
  const { authRequest } = useAuth();

  useEffect(() => {
    queueMicrotask(() => setQueue(loadQueuedActions()));

    const handleQueueChange = () => setQueue(loadQueuedActions());
    window.addEventListener("muvment-offline-queue-change", handleQueueChange);
    return () => {
      window.removeEventListener("muvment-offline-queue-change", handleQueueChange);
    };
  }, []);

  useEffect(() => {
    if (!navigator.onLine || !queue.length) {
      return;
    }

    let cancelled = false;

    async function replay() {
      for (const action of loadQueuedActions()) {
        if (cancelled) {
          break;
        }

        try {
          await authRequest(action.path, {
            body: action.body,
            method: action.method,
          });
          removeQueuedAction(action.id);
        } catch (error) {
          if (error instanceof ApiError && error.isNetworkError) {
            break;
          }
        }
      }
      setQueue(loadQueuedActions());
    }

    void replay();

    return () => {
      cancelled = true;
    };
  }, [authRequest, queue.length]);

  return [queue, setQueue] as const;
}
