"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { signIn, signOut, useSession } from "next-auth/react";
import { api, ApiError, type DateRange } from "./api";
import { getPosition } from "./geo";
import type { ChecklistPhaseName, DailyChecklist, DashboardReading, PickupRequestInput } from "./types";
import type { TodayChecklists } from "./types";

export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,50}$/;

export function useDebounced<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useUsernameSuggestions(firstName: string, lastName: string) {
  const first = useDebounced(firstName.trim(), 350);
  const last = useDebounced(lastName.trim(), 350);
  return useQuery({
    queryKey: ["username-suggestions", first, last],
    queryFn: () => api.suggestUsernames(first, last),
    enabled: Boolean(first && last),
    staleTime: 60_000,
    retry: false,
  });
}

/** "idle" until the username is well-formed, then checking → ok | taken. */
export function useUsernameAvailability(username: string) {
  const debounced = useDebounced(username.trim(), 450);
  const valid = USERNAME_RE.test(debounced);
  const query = useQuery({
    queryKey: ["username-available", debounced],
    queryFn: () => api.checkUsername(debounced),
    enabled: valid,
    staleTime: 30_000,
    retry: false,
  });

  if (!USERNAME_RE.test(username.trim()) || !valid || query.isError) return "idle" as const;
  if (debounced !== username.trim() || query.isPending) return "checking" as const;
  return query.data ? ("ok" as const) : ("taken" as const);
}

export const useSubmitApplication = () =>
  useMutation({ mutationFn: (body: Record<string, unknown>) => api.submitApplication(body) });

export const useForgotPassword = () =>
  useMutation({ mutationFn: (v: { identifier: string }) => api.forgotPassword(v.identifier, "SMS") });

export const useResetPassword = () =>
  useMutation({
    mutationFn: (v: { identifier: string; code: string; newPassword: string }) =>
      api.resetPassword(v.identifier, v.code, v.newPassword),
  });

export function useLogin() {
  const { update } = useSession();
  return useMutation({
    mutationFn: async (v: { identifier: string; password: string }) => {
      const result = await signIn("credentials", { ...v, redirect: false });
      if (!result || result.error) {
        const message = result?.code && result.code !== "credentials" ? result.code : "Invalid username or password.";
        throw new ApiError(401, message);
      }
      // Pull the fresh session into the provider so the next screen already knows who is signed in.
      return update();
    },
  });
}

export function useChangePassword() {
  const { update } = useSession();
  return useMutation({
    mutationFn: async (v: { currentPassword: string; newPassword: string }) => {
      await api.changePassword(v.currentPassword, v.newPassword);
      await update({ hasChangedTemporaryPassword: true });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.logout().catch(() => null); // sign out locally even if the backend call fails
      queryClient.clear();
      await signOut({ redirectTo: "/login" });
    },
  });
}

const STATS_STALE = 30_000;

export function useDvaStats(range: DateRange) {
  const { status } = useSession();
  return useQuery({
    queryKey: ["dva-stats", range.from ?? null, range.to ?? null],
    queryFn: () => api.dvaStats(range),
    enabled: status === "authenticated",
    staleTime: STATS_STALE,
  });
}

export function useWalletStats() {
  const { status } = useSession();
  return useQuery({
    queryKey: ["wallet-stats"],
    queryFn: () => api.walletStats(),
    enabled: status === "authenticated",
    staleTime: STATS_STALE,
  });
}

export function useChargeStats(range: DateRange) {
  const { status } = useSession();
  return useQuery({
    queryKey: ["charge-stats", range.from ?? null, range.to ?? null],
    queryFn: () => api.chargeStats(range),
    enabled: status === "authenticated",
    staleTime: STATS_STALE,
  });
}

const TODAY_REFRESH = 60_000;

/** Today's pick-up / drop-off overview. Polled gently so approvals and window changes show up. */
export function useTodayChecklists() {
  const { status } = useSession();
  return useQuery({
    queryKey: ["daily-checklists-today"],
    // receivedAt lets countdowns follow the server clock instead of the phone's.
    queryFn: async () => ({ data: await api.todayChecklists(), receivedAt: Date.now() }),
    enabled: status === "authenticated",
    staleTime: 15_000,
    refetchInterval: TODAY_REFRESH,
    refetchOnWindowFocus: true,
  });
}

export function useMyPickupRequests() {
  const { status } = useSession();
  return useQuery({
    queryKey: ["pickup-requests-mine"],
    queryFn: () => api.myPickupRequests(),
    enabled: status === "authenticated",
    staleTime: 15_000,
    refetchInterval: TODAY_REFRESH,
    refetchOnWindowFocus: true,
  });
}

export function useCreatePickupRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PickupRequestInput) => api.createPickupRequest(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pickup-requests-mine"] }),
  });
}

/* ------------------------------------------------------------------ */
/* Daily checklist                                                     */
/* ------------------------------------------------------------------ */
type TodayCache = { data: TodayChecklists | null; receivedAt: number };

/** Writes a fresh checklist into today's overview, so the home screen and the flow share one truth. */
export function putChecklist(queryClient: QueryClient, checklist: DailyChecklist) {
  queryClient.setQueryData<TodayCache>(["daily-checklists-today"], (old) => {
    if (!old?.data) return old;
    const submitted = checklist.status === "SUBMITTED";
    const phases = old.data.phases.map((p) =>
      p.phase === checklist.phase ? { ...p, checklist, can_start: submitted ? false : p.can_start } : p,
    );
    return { ...old, data: { ...old.data, phases } };
  });
}

export function useStartChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (phase: ChecklistPhaseName) => api.startChecklist(phase, await getPosition()),
    onSuccess: (checklist) => putChecklist(queryClient, checklist),
  });
}

export function useSubmitChecklist(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => api.submitChecklist(id, await getPosition()),
    onSuccess: (checklist) => putChecklist(queryClient, checklist),
  });
}

/** Watches a submitted checklist while the AI reads it, then stops. */
export function useChecklistAnalysis(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["daily-checklist", id],
    queryFn: async () => {
      const checklist = await api.getChecklist(id);
      putChecklist(queryClient, checklist);
      return checklist;
    },
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.analysis.status;
      return !status || status === "PENDING" || status === "PROCESSING" ? 3000 : false;
    },
  });
}

export function useReanalyze(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.reanalyzeChecklist(id),
    onSuccess: (checklist) => {
      putChecklist(queryClient, checklist);
      void queryClient.invalidateQueries({ queryKey: ["daily-checklist", id] });
    },
  });
}

export function useUpdateDashboard(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DashboardReading) => api.updateDashboard(id, body),
    onSuccess: (checklist) => putChecklist(queryClient, checklist),
  });
}
