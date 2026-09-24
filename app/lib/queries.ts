"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { signIn, signOut, useSession } from "next-auth/react";
import { api, ApiError } from "./api";

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
