"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { Toaster } from "sonner";

function subscribeToTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const readTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** Toasts follow the app's own light/dark switch, not just the OS setting. */
function AppToaster() {
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, () => "light" as const);
  return (
    <Toaster
      closeButton
      richColors
      duration={4500}
      position="top-center"
      theme={theme}
      mobileOffset={{ top: "max(0.75rem, env(safe-area-inset-top))", left: "1rem", right: "1rem" }}
      toastOptions={{ style: { borderRadius: "1rem", fontFamily: "inherit", fontWeight: 500 } }}
    />
  );
}

export function Providers({ session, children }: { session: Session | null; children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }),
  );

  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <QueryClientProvider client={queryClient}>
        {children}
        <AppToaster />
      </QueryClientProvider>
    </SessionProvider>
  );
}
