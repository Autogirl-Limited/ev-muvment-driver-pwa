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
  login as loginRequest,
  logout as logoutRequest,
  refresh as refreshRequest,
  verifyEmailOtp,
  verifyTotp,
} from "@/app/lib/api-client";
import type {
  DriverNotification,
  LoginResponse,
  NotificationPriority,
  PaginatedResult,
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
type LegalView = "about" | "privacy-policy" | "terms";
type ProfileUtilityView =
  | "change-password"
  | "edit-profile"
  | `legal:${LegalView}`
  | "notification-settings";
type AppView = Tab | "notifications" | ProfileUtilityView;
type IconName =
  | "arrowLeft"
  | "bell"
  | "bolt"
  | "car"
  | "chevronDown"
  | "clock"
  | "creditCard"
  | "history"
  | "home"
  | "profile"
  | "route"
  | "trendUp";

type LoginOutcome =
  | { status: "success" }
  | {
      challengeToken: string;
      method: "EMAIL_OTP" | "TOTP";
      status: "two_factor_required";
    };

const notificationFilters = ["All", "Unread", "Read", "High", "Urgent"] as const;
type NotificationFilter = (typeof notificationFilters)[number];

const legalContent: Record<
  LegalView,
  {
    title: string;
    sourceLabel: string;
    updated?: string;
    sections: { heading: string; body: string }[];
  }
> = {
  about: {
    title: "About Muvment",
    sourceLabel: "muvment.ng/about-us",
    sections: [
      {
        heading: "Powering Africa mobility",
        body: "Muvment by Autogirl is building an integrated sustainable mobility ecosystem across Africa, spanning premium rentals, EV ride-hailing, and fleet operations.",
      },
      {
        heading: "Mission",
        body: "The company mission is to make reliable, premium, and sustainable mobility accessible to every African.",
      },
      {
        heading: "Operating footprint",
        body: "Muvment started in Lagos and now operates across cities in Nigeria and Ghana with a growing EV fleet and partnerships across the mobility ecosystem.",
      },
    ],
  },
  "privacy-policy": {
    title: "Privacy Policy",
    sourceLabel: "muvment.ng/policy/privacy-policy",
    updated: "Last updated March 31, 2026",
    sections: [
      {
        heading: "Information collected",
        body: "Muvment collects personal, rental, device, location, vehicle, and support information needed to provide mobility services and operate safely.",
      },
      {
        heading: "How information is used",
        body: "Information is used for operations, service delivery, billing, support, safety, compliance, business administration, and permitted communications.",
      },
      {
        heading: "Security and rights",
        body: "Muvment describes reasonable safeguards for personal data and notes that users may request access, correction, restriction, portability, deletion, or consent withdrawal where applicable.",
      },
      {
        heading: "Contact",
        body: "Privacy questions can be directed to info@muvment.ng or Muvment, 10 Anuoluwapo Close, Opebi, Ikeja, Lagos, Nigeria.",
      },
    ],
  },
  terms: {
    title: "Terms",
    sourceLabel: "host.muvment.ng/terms-of-service",
    updated: "Last updated July 13, 2026",
    sections: [
      {
        heading: "Overview",
        body: "Muvment is operated by Autogirl Limited. Its host terms explain daily and monthly vehicle-hosting arrangements and related operational responsibilities.",
      },
      {
        heading: "Payments and availability",
        body: "The terms describe payment timing, pricing, availability expectations, and the requirement to honour accepted bookings or notify Muvment when unavailable.",
      },
      {
        heading: "Drivers and compliance",
        body: "Only registered drivers may be assigned to trips, and documents, insurance, and vehicle condition requirements must remain current.",
      },
      {
        heading: "Disputes",
        body: "The terms identify Nigerian law as governing law and describe good-faith negotiation, mediation, and arbitration for unresolved disputes.",
      },
    ],
  },
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
      let refreshing = false;

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) {
          return;
        }

        refreshing = true;
        window.location.reload();
      });

      void navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        .then((registration) => {
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }

          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;

            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                worker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });

          return registration.update();
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
  const [activeView, setActiveView] = useState<AppView>("home");
  const activeTab = getActiveTab(activeView);

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
    <main className="min-h-screen bg-white pb-[168px] text-[#1F2937]">
      <div className="mx-auto flex min-h-screen w-full max-w-[800px] flex-col gap-5 px-4 pt-3">
        {activeView === "home" ? (
          <HomeScreen onOpenNotifications={() => setActiveView("notifications")} />
        ) : null}
        {activeView === "notifications" ? (
          <NotificationsScreen onBack={() => setActiveView("home")} />
        ) : null}
        {activeView === "activity" ? <ActivityScreen /> : null}
        {activeView === "charging" ? <ChargingScreen /> : null}
        {activeView === "payments" ? <PaymentsScreen /> : null}
        {activeView === "profile" ? (
          <ProfileScreen onOpenView={setActiveView} />
        ) : null}
        {activeView === "notification-settings" ? (
          <NotificationSettingsScreen onBack={() => setActiveView("profile")} />
        ) : null}
        {activeView === "edit-profile" ? (
          <PlaceholderUtilityScreen
            onBack={() => setActiveView("profile")}
            title="Edit Profile"
            description="Profile editing will use the same account fields and validation as the mobile app."
          />
        ) : null}
        {activeView === "change-password" ? (
          <PlaceholderUtilityScreen
            onBack={() => setActiveView("profile")}
            title="Change Password"
            description="Password changes stay behind the authenticated API flow and will match the mobile app form."
          />
        ) : null}
        {activeView.startsWith("legal:") ? (
          <LegalScreen
            onBack={() => setActiveView("profile")}
            slug={activeView.replace("legal:", "") as LegalView}
          />
        ) : null}
      </div>
      <BottomTabs activeTab={activeTab} onTabChange={(tab) => setActiveView(tab)} />
    </main>
  );
}

function getActiveTab(view: AppView): Tab {
  switch (view) {
    case "home":
    case "activity":
    case "charging":
    case "payments":
    case "profile":
      return view;
    case "notifications":
      return "home";
    case "change-password":
    case "edit-profile":
    case "legal:about":
    case "legal:privacy-policy":
    case "legal:terms":
    case "notification-settings":
      return "profile";
  }
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
            className="min-h-12 w-full rounded-[14px] bg-[#0673FF] px-4 py-3 text-sm font-semibold leading-[18px] text-white disabled:cursor-not-allowed disabled:opacity-50"
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
            className="min-h-12 w-full rounded-[14px] border border-[#0673FF] bg-white px-4 py-3 text-sm font-semibold leading-[18px] text-[#0673FF]"
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
        className="min-h-12 w-full rounded-[13px] border border-[#E5E7EB] bg-white px-4 text-[15px] font-normal text-[#1F2937] outline-none transition placeholder:text-[#69718C] focus:border-[#0673FF] focus:ring-2 focus:ring-[#EAF3FF]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function HomeScreen({
  onOpenNotifications,
}: {
  onOpenNotifications: () => void;
}) {
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
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-[24px] font-medium leading-[31px] text-[#1F2937]">
          Good morning, {firstName}
        </h2>
        <button
          aria-label="Open notifications"
          className="relative flex h-[54px] w-[54px] items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#1F2937]"
          onClick={onOpenNotifications}
          type="button"
        >
          <Icon name="bell" size={20} />
          <span className="absolute right-4 top-[15px] h-2 w-2 rounded-full bg-[#EF4444]" />
        </button>
      </header>

      <button
        className="flex w-full items-center justify-between gap-4 text-left"
        type="button"
      >
        <div>
          <p className="text-[15px] font-normal leading-5 text-[#69718C]">Current vehicle</p>
          <div className="mt-1 flex items-center gap-1">
            <h3 className="text-[23px] font-medium leading-[30px] text-[#1F2937]">
              {vehicle?.model ?? "No vehicle"}
            </h3>
            <Icon name="chevronDown" size={18} />
          </div>
        </div>
      </button>

      <div className="flex min-h-[108px] flex-wrap items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#FAFAFB] p-2">
        <div className="min-h-[90px] min-w-[132px] flex-[1.3] rounded-xl border border-[#E5E7EB] bg-white p-3">
          <p className="text-[13px] font-normal leading-[18px] text-[#69718C]">
            Shift Time Left
          </p>
          <p className="mt-1 text-[28px] font-medium leading-[34px] text-black">
            07h 43m
          </p>
        </div>
        <ActionPill active icon="trendUp" label="Pickup" />
        <ActionPill icon="bolt" label="Charging" />
        <ActionPill icon="history" label="History" />
      </div>

      <div className="flex flex-col items-center gap-2 pt-4">
        <Image
          alt="Assigned sedan"
          className="h-auto w-full"
          height={327}
          priority
          src="/sedan.png"
          width={640}
        />
        <div className="text-center">
          <p className="text-base font-medium leading-[22px] text-[#1F2937]">
            {vehicle?.code}
          </p>
          <p className="text-[13px] font-normal leading-[18px] text-[#69718C]">
            {vehicle?.plateNumber}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-normal leading-[18px] text-[#69718C]">
              Today&apos;s shift
            </p>
            <h3 className="text-[22px] font-medium leading-7 text-black">On shift</h3>
          </div>
          <span className="rounded-full bg-[#F0FDF4] px-3 py-1 text-[13px] font-medium leading-[18px] text-[#16A34A]">
            Active
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InfoCell label="Pickup window" value="5:00 AM - 7:00 AM" />
          <InfoCell label="Started" value="6:17 AM" />
          <InfoCell label="Expected end" value="6:17 PM" />
          <InfoCell label="Final deadline" value="11:00 PM" />
        </div>
        <button
          className="mt-4 min-h-12 w-full rounded-[14px] bg-[#0673FF] px-4 py-3 text-sm font-semibold leading-[18px] text-white"
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

      <div className="grid grid-cols-2 gap-2">
        <MetricCard icon="bolt" label="Battery" value="72%" helper="34 min left" progress={72} />
        <MetricCard icon="route" label="Estimated Range" value="280" helper="km left" />
        <MetricCard icon="car" label="Allowance" value="8.2" helper="kWh left" />
        <div className="flex min-h-[120px] flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-3">
          <div>
            <p className="text-sm font-normal leading-[19px] text-[#1F2937]">Shift Status</p>
            <p className="mt-2 text-lg font-medium leading-6 text-black">On Shift</p>
          </div>
          <div className="flex h-8 w-14 items-center justify-end rounded-full bg-[#0673FF] p-1">
            <span className="h-6 w-6 rounded-full bg-white shadow-sm" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <div className="flex items-center gap-2">
          <Icon className="text-[#69718C]" name="car" size={18} />
          <p className="text-[13px] font-normal leading-[18px] text-[#69718C]">
            Next action
          </p>
        </div>
        <p className="mt-2 text-xl font-medium leading-[26px] text-black">
          Start drop-off when your shift is complete
        </p>
        <p className="mt-2 text-sm font-normal leading-5 text-[#69718C]">
          Final drop-off deadline is 11:00 PM today.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[19px] font-medium leading-6 text-[#1F2937]">Needs attention</h3>
          <span className="text-sm font-medium leading-5 text-[#0673FF]">View all</span>
        </div>
        {shift.alerts.map((alert) => (
          <div
            className="flex gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4"
            key={alert.id}
          >
            <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-[#D97706]" />
            <div>
              <p className="font-medium text-[#1F2937]">{alert.title}</p>
              <p className="mt-1 text-sm text-[#69718C]">{alert.message}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const { authRequest } = useAuth();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [selectedFilter, setSelectedFilter] =
    useState<NotificationFilter>("All");
  const [selectedNotification, setSelectedNotification] =
    useState<DriverNotification | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const query = useMemo(() => {
    if (selectedFilter === "Unread") return { isRead: false };
    if (selectedFilter === "Read") return { isRead: true };
    if (selectedFilter === "High") {
      return { priority: "HIGH" as NotificationPriority };
    }
    if (selectedFilter === "Urgent") {
      return { priority: "URGENT" as NotificationPriority };
    }
    return {};
  }, [selectedFilter]);

  const loadNotifications = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const [list, unread] = await Promise.all([
        authRequest<PaginatedResult<DriverNotification>>("/api/v1/notifications", {
          query: { ...query, page: 1, page_size: 20 },
        }),
        authRequest<Record<string, number>>("/api/v1/notifications/unread-count"),
      ]);

      setNotifications(list.items);
      setUnreadCount(Object.values(unread)[0] ?? 0);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load notifications.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [authRequest, query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadNotifications();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadNotifications]);

  async function handleReadAll() {
    setError("");

    try {
      await authRequest<null>("/api/v1/notifications/read-all", {
        method: "POST",
      });
      setSelectedNotification(null);
      await loadNotifications();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to mark notifications read.",
      );
    }
  }

  async function handleOpenNotification(notification: DriverNotification) {
    setError("");

    try {
      const fullNotification = await authRequest<DriverNotification>(
        `/api/v1/notifications/${notification.id}`,
      );
      setSelectedNotification(fullNotification);

      if (!fullNotification.is_read) {
        const updated = await authRequest<DriverNotification>(
          `/api/v1/notifications/${notification.id}/read`,
          { method: "PATCH" },
        );
        setSelectedNotification(updated);
        await loadNotifications();
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to open notification.",
      );
    }
  }

  return (
    <section className="space-y-5">
      <button
        aria-label="Go back"
        className="flex min-h-11 items-center justify-center text-[#1F2937]"
        onClick={onBack}
        type="button"
      >
        <Icon name="arrowLeft" size={28} />
      </button>

      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[30px] font-semibold leading-9 text-black">
              Notifications
            </h2>
            <p className="mt-2 text-[15px] font-normal leading-[22px] text-[#69718C]">
              {unreadCount} unread message{unreadCount === 1 ? "" : "s"}.
            </p>
          </div>
          <button
            className="min-h-10 shrink-0 text-sm font-medium leading-5 text-[#0673FF]"
            onClick={handleReadAll}
            type="button"
          >
            Read all
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {notificationFilters.map((filter) => {
          const isSelected = selectedFilter === filter;

          return (
            <button
              className={`rounded-full border px-3 py-2 text-[13px] font-normal leading-[18px] ${
                isSelected
                  ? "border-[#0673FF] bg-[#0673FF] text-white"
                  : "border-[#E5E7EB] bg-[#F8FAFC] text-[#69718C]"
              }`}
              key={filter}
              onClick={() => {
                setSelectedFilter(filter);
                setSelectedNotification(null);
              }}
              type="button"
            >
              {filter}
            </button>
          );
        })}
      </div>

      {selectedNotification ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <p className="text-[17px] font-medium leading-[23px] text-[#1F2937]">
            {selectedNotification.title}
          </p>
          <p className="mt-2 text-sm font-normal leading-5 text-[#69718C]">
            {selectedNotification.description}
          </p>
        </div>
      ) : null}

      {error ? <p className="text-[13px] font-medium leading-[18px] text-[#DC2626]">{error}</p> : null}

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm font-normal leading-5 text-[#69718C]">
            Loading notifications...
          </p>
        ) : notifications.length ? (
          notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onPress={() => void handleOpenNotification(notification)}
            />
          ))
        ) : (
          <p className="text-sm font-normal leading-5 text-[#69718C]">
            No notifications found.
          </p>
        )}
      </div>
    </section>
  );
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: DriverNotification;
  onPress: () => void;
}) {
  return (
    <button
      className="w-full rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left"
      onClick={onPress}
      type="button"
    >
      <div className="flex justify-between gap-4">
        <div className="flex items-center gap-2">
          {!notification.is_read ? (
            <span className="h-2 w-2 rounded-full bg-[#0673FF]" />
          ) : null}
          <span className="text-xs font-normal leading-4 text-[#69718C]">
            {notification.priority}
          </span>
        </div>
        <span className="text-xs font-normal leading-4 text-[#69718C]">
          {formatNotificationTime(notification.created_at)}
        </span>
      </div>
      <p className="mt-2 text-[17px] font-medium leading-[23px] text-black">
        {notification.title}
      </p>
      <p className="mt-1 text-sm font-normal leading-5 text-[#69718C]">
        {notification.description}
      </p>
    </button>
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
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
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
            className="rounded-2xl border border-[#E5E7EB] bg-white p-4"
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
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[#69718C]">Charging used</p>
            <p className="text-3xl font-semibold">
              {shift.charging.usedKwh.toFixed(1)} kWh
            </p>
          </div>
          <p className="text-2xl font-semibold">{usedPercent}%</p>
        </div>
        <div className="mt-4 h-[42px] overflow-hidden rounded-xl bg-[#F0F1F3]">
          <div
            className="h-full rounded-xl bg-[#2FC866]"
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
      <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
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
      <div className="grid grid-cols-2 rounded-[14px] bg-[#F3F4F6] p-1">
        {(["amount", "date"] as const).map((option) => (
          <button
            className={`min-h-10 rounded-[11px] text-sm font-normal ${
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
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
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
          className="mt-4 min-h-12 w-full rounded-[14px] bg-[#0673FF] px-4 py-3 text-sm font-semibold leading-[18px] text-white"
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
              className="flex items-center justify-between gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-4"
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
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <p className="font-semibold">No matching transaction</p>
            <p className="mt-1 text-sm text-[#69718C]">
              We could not find a transaction matching your search.
            </p>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
        <p className="font-semibold">Read-only lookup</p>
        <p className="mt-1 text-sm text-[#69718C]">
          Drivers can search received transactions only. Confirmation and
          settlement actions stay outside this app.
        </p>
      </div>
    </section>
  );
}

function ProfileScreen({
  onOpenView,
}: {
  onOpenView: (view: ProfileUtilityView) => void;
}) {
  const { logout, user, virtualAccount } = useAuth();
  const [appearanceMode, setAppearanceMode] = useState<"dark" | "light" | "system">(
    "system",
  );
  const [logoutError, setLogoutError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const initials = `${user?.first_name?.[0] ?? "D"}${user?.last_name?.[0] ?? "R"}`.toUpperCase();

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
      <div className="flex items-center gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
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
      <div className="divide-y divide-[#E5E7EB] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
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

      <div className="divide-y divide-[#E5E7EB] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
        <SettingsRow label="Edit Profile" onPress={() => onOpenView("edit-profile")} />
        <SettingsRow label="Change Password" onPress={() => onOpenView("change-password")} />
        <SettingsRow
          label="Notification Settings"
          onPress={() => onOpenView("notification-settings")}
        />
        <SettingsRow label="Terms" onPress={() => onOpenView("legal:terms")} />
        <SettingsRow
          label="Privacy Policy"
          onPress={() => onOpenView("legal:privacy-policy")}
        />
        <SettingsRow label="About" onPress={() => onOpenView("legal:about")} />
      </div>

      <div className="space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <div>
          <p className="text-lg font-medium leading-6 text-black">Appearance</p>
          <p className="mt-1 text-sm font-normal leading-5 text-[#69718C]">
            Light, dark, or follow your system.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["system", "light", "dark"] as const).map((mode) => (
            <button
              className={`min-h-11 rounded-[14px] border px-3 py-2 text-sm font-semibold leading-[18px] ${
                appearanceMode === mode
                  ? "border-[#0673FF] bg-[#0673FF] text-white"
                  : "border-[#0673FF] bg-white text-[#0673FF]"
              }`}
              key={mode}
              onClick={() => setAppearanceMode(mode)}
              type="button"
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between gap-4 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
        <p className="text-sm font-normal leading-5 text-[#69718C]">App Version</p>
        <p className="text-sm font-medium leading-5 text-[#1F2937]">1.0.0</p>
      </div>

      {logoutError ? <p className="text-sm font-medium text-[#DC2626]">{logoutError}</p> : null}
      <button
        className="min-h-12 w-full rounded-[14px] border border-[#0673FF] bg-white px-4 py-3 text-sm font-semibold leading-[18px] text-[#0673FF] disabled:opacity-50"
        disabled={isLoggingOut}
        onClick={handleLogout}
        type="button"
      >
        {isLoggingOut ? "Logging out..." : "Logout"}
      </button>
    </section>
  );
}

function SettingsRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      className="flex min-h-[54px] w-full items-center justify-between gap-4 px-4 text-left"
      onClick={onPress}
      type="button"
    >
      <span className="text-[15px] font-normal leading-5 text-[#1F2937]">{label}</span>
      <span className="text-2xl font-light leading-7 text-[#69718C]">›</span>
    </button>
  );
}

function NotificationSettingsScreen({ onBack }: { onBack: () => void }) {
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);

  return (
    <section className="space-y-5">
      <BackButton onBack={onBack} />
      <ScreenHeader
        title="Notification Settings"
        subtitle="Choose how Muvment reaches you during active driver operations."
      />
      <div className="divide-y divide-[#E5E7EB] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
        <SwitchRow
          enabled={pushEnabled}
          label="Push Notifications"
          onChange={setPushEnabled}
          value="Shift alerts, charging updates, and driver reminders."
        />
        <SwitchRow
          enabled={locationEnabled}
          label="Location"
          onChange={setLocationEnabled}
          value="Used for nearby charging, routing, pickup, and drop-off support."
        />
      </div>
    </section>
  );
}

function SwitchRow({
  enabled,
  label,
  onChange,
  value,
}: {
  enabled: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
  value: string;
}) {
  return (
    <div className="flex min-h-[84px] items-center justify-between gap-4 p-4">
      <div className="flex-1">
        <p className="text-base font-medium leading-[22px] text-[#1F2937]">{label}</p>
        <p className="mt-1 text-sm font-normal leading-5 text-[#69718C]">{value}</p>
      </div>
      <button
        aria-pressed={enabled}
        className={`flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition ${
          enabled ? "justify-end bg-[#0673FF]" : "justify-start bg-[#D1D5DB]"
        }`}
        onClick={() => onChange(!enabled)}
        type="button"
      >
        <span className="h-6 w-6 rounded-full bg-white shadow-sm" />
      </button>
    </div>
  );
}

function LegalScreen({
  onBack,
  slug,
}: {
  onBack: () => void;
  slug: LegalView;
}) {
  const content = legalContent[slug];

  return (
    <section className="space-y-5">
      <BackButton onBack={onBack} />
      <header>
        <h2 className="text-[30px] font-semibold leading-9 text-black">{content.title}</h2>
        <p className="mt-2 text-[15px] font-normal leading-[22px] text-[#69718C]">
          {content.updated ? `${content.updated} / ` : ""}
          {content.sourceLabel}
        </p>
      </header>
      <div className="space-y-3">
        {content.sections.map((section) => (
          <div
            className="rounded-2xl border border-[#E5E7EB] bg-white p-4"
            key={section.heading}
          >
            <p className="text-[17px] font-medium leading-[23px] text-[#1F2937]">
              {section.heading}
            </p>
            <p className="mt-2 text-sm font-normal leading-5 text-[#69718C]">
              {section.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlaceholderUtilityScreen({
  description,
  onBack,
  title,
}: {
  description: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <section className="space-y-5">
      <BackButton onBack={onBack} />
      <ScreenHeader title={title} subtitle={description} />
      <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
        <p className="text-sm font-normal leading-5 text-[#69718C]">
          This PWA screen is ready to be connected to the same backend flow as the mobile app.
        </p>
      </div>
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
  const tabs: { icon: IconName; label: string; tab: Tab }[] = [
    { icon: "home", label: "Home", tab: "home" },
    { icon: "history", label: "Activity", tab: "activity" },
    { icon: "bolt", label: "Charging", tab: "charging" },
    { icon: "creditCard", label: "Payments", tab: "payments" },
    { icon: "profile", label: "Profile", tab: "profile" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-[#E5E7EB] bg-white px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
      <div className="mx-auto grid max-w-[820px] grid-cols-5 gap-1">
        {tabs.map((item) => (
          <button
            className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium leading-[14px] ${
              activeTab === item.tab
                ? "bg-[#EAF3FF] text-[#0673FF]"
                : "text-[#9CA3AF]"
            }`}
            key={item.tab}
            onClick={() => onTabChange(item.tab)}
            type="button"
          >
            <Icon name={item.icon} size={21} />
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <p className="text-[13px] font-normal leading-[18px] text-[#69718C]">{label}</p>
      <p className="mt-1 text-sm font-medium leading-5 text-[#1F2937]">{value}</p>
    </div>
  );
}

function ActionPill({
  active,
  icon,
  label,
}: {
  active?: boolean;
  icon: IconName;
  label: string;
}) {
  return (
    <div className="flex w-[62px] flex-col items-center gap-2">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full border ${
          active
            ? "border-[#111111] bg-[#111111] text-white"
            : "border-[#E5E7EB] bg-white text-[#1F2937]"
        }`}
      >
        <Icon name={icon} size={18} />
      </div>
      <p className="text-center text-xs font-normal leading-4 text-[#69718C]">{label}</p>
    </div>
  );
}

function MetricCard({
  helper,
  icon,
  label,
  progress,
  value,
}: {
  helper: string;
  icon: IconName;
  label: string;
  progress?: number;
  value: string;
}) {
  return (
    <div className="min-h-[120px] rounded-2xl border border-[#E5E7EB] bg-white p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F3F4F6] text-[#69718C]">
          <Icon name={icon} size={16} />
        </div>
        <p className="text-sm font-normal leading-[19px] text-[#1F2937]">{label}</p>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="text-[31px] font-medium leading-9 text-black">{value}</p>
        <p className="pb-1 text-[13px] font-normal leading-6 text-[#69718C]">{helper}</p>
      </div>
      {progress ? (
        <div className="mt-3 h-9 overflow-hidden rounded-[10px] bg-[#F0F1F3]">
          <div
            className="h-full rounded-[10px] bg-[#2FC866]"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
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

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      aria-label="Go back"
      className="flex min-h-11 w-fit items-center justify-center text-[#1F2937]"
      onClick={onBack}
      type="button"
    >
      <Icon name="arrowLeft" size={28} />
    </button>
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

function formatNotificationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function Icon({
  className,
  name,
  size = 20,
}: {
  className?: string;
  name: IconName;
  size?: number;
}) {
  const common = {
    className,
    fill: "none",
    height: size,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    width: size,
  };

  switch (name) {
    case "arrowLeft":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        </svg>
      );
    case "car":
      return (
        <svg {...common} aria-hidden="true">
          <path d="m5 11 1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
          <path d="M3 11h18v6H3z" />
          <path d="M7 17v2" />
          <path d="M17 17v2" />
          <path d="M7 14h.01" />
          <path d="M17 14h.01" />
        </svg>
      );
    case "chevronDown":
      return (
        <svg {...common} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "clock":
    case "history":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "creditCard":
      return (
        <svg {...common} aria-hidden="true">
          <rect height="14" rx="2" width="20" x="2" y="5" />
          <path d="M2 10h20" />
          <path d="M6 15h2" />
        </svg>
      );
    case "home":
      return (
        <svg {...common} aria-hidden="true">
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "route":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="6" r="3" />
          <path d="M9 18h1a4 4 0 0 0 4-4v-4a4 4 0 0 1 4-4" />
        </svg>
      );
    case "trendUp":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M7 17 17 7" />
          <path d="M8 7h9v9" />
        </svg>
      );
  }
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
