"use client";

import { useEffect, useState } from "react";

/** A ticking "now" on the server's clock: the phone's own clock never decides what is open or late. */
export function useServerNow(fetched: { serverTime: string | undefined; receivedAt: number } | null) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const offset = fetched?.serverTime ? Date.parse(fetched.serverTime) - fetched.receivedAt : 0;
  return tick + offset;
}
