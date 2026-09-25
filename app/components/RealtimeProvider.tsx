"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { notificationTarget } from "../lib/notification-link";
import { putChecklist } from "../lib/queries";
import { playNotificationSound, unlockSound } from "../lib/sound";
import type { AppNotification, DailyChecklist } from "../lib/types";

export type RealtimeStatus = "connecting" | "live" | "offline";

const StatusContext = createContext<RealtimeStatus>("offline");
export const useRealtimeStatus = () => useContext(StatusContext);

const MAX_BACKOFF = 30_000;
const invalidate = (queryClient: QueryClient, ...keys: string[]) =>
  keys.forEach((key) => void queryClient.invalidateQueries({ queryKey: [key] }));

/** Tells the driver even when the app isn't in front of them, where the browser allows it. */
function showSystemNotification(n: AppNotification, onOpen: () => void) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const shown = new Notification(n.title, { body: n.description, icon: "/images/logo/icon.png", tag: n.id });
    shown.onclick = () => {
      window.focus();
      onOpen();
      shown.close();
    };
  } catch {
    /* some mobile browsers only allow this through a service worker */
  }
}

/**
 * One live socket for the whole signed-in app. Every event lands in the same React Query cache the
 * screens already read, so pages update by themselves and never need to know a socket exists.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status: auth, update } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [status, setStatus] = useState<RealtimeStatus>("offline");

  // Latest values for the long-lived socket callbacks, without reconnecting when they change.
  const latest = useRef({ update, router });
  useEffect(() => {
    latest.current = { update, router };
  });

  // Sound is only allowed after the driver has touched the page once.
  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (auth !== "authenticated") return;

    let socket: WebSocket | null = null;
    let timer: number | undefined;
    let profileTimer: number | undefined;
    let backoff = 1000;
    let cancelled = false;
    let connectedBefore = false;

    // Shift, wallet balance and vehicle live in the session; ask the server for a fresh copy (debounced).
    const refreshProfile = () => {
      window.clearTimeout(profileTimer);
      profileTimer = window.setTimeout(() => void latest.current.update({ refreshProfile: true }), 800);
    };

    const onNotification = (n: AppNotification) => {
      queryClient.setQueryData<number>(["notifications-unread"], (count) => (count ?? 0) + 1);
      invalidate(queryClient, "notifications", "notifications-unread");
      // Approvals, drop-off reminders and vehicle changes all arrive as notifications; keep the home screen honest.
      invalidate(queryClient, "pickup-requests-mine", "daily-checklists-today");

      playNotificationSound();
      navigator.vibrate?.(n.priority === "URGENT" || n.priority === "HIGH" ? [120, 70, 120] : 70);

      const open = () => latest.current.router.push(notificationTarget(n));
      if (document.visibilityState === "hidden") return showSystemNotification(n, open);

      const options = {
        description: n.description,
        duration: n.priority === "URGENT" ? 12_000 : 6500,
        icon: <BellRing size={18} />,
        action: { label: "View", onClick: open },
      };
      if (n.priority === "URGENT") toast.error(n.title, options);
      else toast(n.title, options);
    };

    const handle = (event: string, data: unknown) => {
      switch (event) {
        case "notification.created":
          return onNotification(data as AppNotification);

        case "daily_checklist.updated": {
          const checklist = data as DailyChecklist;
          putChecklist(queryClient, checklist);
          queryClient.setQueryData(["daily-checklist", checklist.id], checklist);
          invalidate(queryClient, "daily-checklists-today");
          if (checklist.status === "SUBMITTED") refreshProfile(); // pick-up starts the shift, drop-off ends it
          return;
        }

        case "checklist_settings.updated":
          return invalidate(queryClient, "daily-checklists-today");

        case "vehicle.assigned":
        case "vehicle.unassigned":
        case "vehicle.updated":
          refreshProfile();
          return invalidate(queryClient, "daily-checklists-today");

        case "wallet_allocation.created":
        case "wallet_allocation.updated":
        case "energy_rate.updated":
          refreshProfile();
          return invalidate(queryClient, "wallet-stats");

        case "dva_transaction.created":
          return invalidate(queryClient, "dva-stats", "dva-transactions");

        default:
          return; // new event types are added over time; ignore what we don't know
      }
    };

    const schedule = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void connect(), backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    };

    const connect = async () => {
      if (cancelled || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
      setStatus("connecting");

      let credentials: { url: string; token: string };
      try {
        const response = await fetch("/api/realtime", { cache: "no-store" });
        if (response.status === 401) {
          toast.error("Your session has expired. Please sign in again.");
          void signOut({ redirectTo: "/login" });
          return;
        }
        if (!response.ok) throw new Error("credentials");
        credentials = await response.json();
      } catch {
        setStatus("offline");
        return schedule();
      }
      if (cancelled) return;

      const ws = new WebSocket(`${credentials.url}?token=${encodeURIComponent(credentials.token)}`);
      socket = ws;

      ws.onopen = () => {
        backoff = 1000;
        setStatus("live");
        // Nothing is replayed for the time we were away, so reload whatever the screens are showing.
        if (connectedBefore) {
          void queryClient.invalidateQueries();
          refreshProfile();
        }
        connectedBefore = true;
      };

      ws.onmessage = (message) => {
        try {
          const { event, data } = JSON.parse(String(message.data));
          if (typeof event === "string") handle(event, data);
        } catch {
          /* malformed frame: ignore */
        }
      };

      ws.onclose = (close) => {
        if (socket === ws) socket = null;
        if (cancelled) return;
        setStatus("offline");
        if (close.code === 4401) {
          // The token was rejected. It is the only one we have, so the driver has to sign in again.
          toast.error("Your session has expired. Please sign in again.");
          void signOut({ redirectTo: "/login" });
          return;
        }
        schedule();
      };
    };

    // Phones freeze sockets in the background and drop them when the network changes: come back fast.
    const wake = () => {
      if (document.visibilityState === "hidden") return;
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        backoff = 1000;
        void connect();
      } else {
        invalidate(queryClient, "daily-checklists-today", "pickup-requests-mine", "notifications-unread");
      }
    };

    void connect();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(profileTimer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      socket?.close(1000);
    };
  }, [auth, queryClient]);

  return <StatusContext.Provider value={auth === "authenticated" ? status : "offline"}>{children}</StatusContext.Provider>;
}
