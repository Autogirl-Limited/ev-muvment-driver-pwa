"use client";

import { useEffect, useState } from "react";
import { getSession, type LoginData } from "./api";

/** Reads the stored session after mount (localStorage is client-only). */
export function useSession() {
  const [state, setState] = useState<{ session: LoginData | null; ready: boolean }>({
    session: null,
    ready: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setState({ session: getSession(), ready: true }), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return { ...state, setSession: (session: LoginData | null) => setState({ session, ready: true }) };
}
