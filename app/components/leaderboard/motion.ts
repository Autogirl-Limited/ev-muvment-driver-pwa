"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { LeaderboardEntry } from "../../lib/types";

export const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Ticks a number from what is on screen to the new value, so a count grows instead of jumping. */
export function useCountUp(target: number, duration = 700) {
  const [reduced] = useState(reducedMotion);
  const [value, setValue] = useState(target);
  const shown = useRef(target);

  useEffect(() => {
    const start = shown.current;
    if (reduced || start === target) {
      shown.current = target;
      return;
    }
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      shown.current = Math.round(start + (target - start) * eased);
      setValue(shown.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  return reduced ? target : value;
}

/**
 * FLIP: when the order of `[data-flip]` children changes, each one slides from where it was to where it is now.
 * `order` is any string that changes when the order does (e.g. the ids joined).
 */
export function useFlip(ref: RefObject<HTMLElement | null>, order: string) {
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previous = positions.current;
    const next = new Map<string, number>();
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-flip]"))) {
      const key = el.dataset.flip ?? "";
      const top = el.getBoundingClientRect().top;
      next.set(key, top);
      const before = previous.get(key);
      if (before !== undefined && Math.abs(before - top) > 1 && !reducedMotion() && "animate" in el) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], { duration: 560, easing: EASE });
      }
    }
    positions.current = next;
  }, [ref, order]);
}

export type RankMove = "up" | "down";

type RankSnapshot = { date: string; entries: LeaderboardEntry[] };

/**
 * Which drivers just moved up or down since the last refresh of the same day; cleared again after a few seconds.
 * The previous board is remembered in state and compared during render (React's "adjust state on prop change"
 * pattern), so nothing is set from inside an effect.
 */
export function useRankMoves(entries: LeaderboardEntry[] | undefined, date: string) {
  const [snapshot, setSnapshot] = useState<RankSnapshot | null>(null);
  const [moves, setMoves] = useState<Map<string, RankMove>>(() => new Map());

  if (entries && (snapshot?.entries !== entries || snapshot.date !== date)) {
    setSnapshot({ date, entries });
    if (snapshot && snapshot.date === date) {
      const before = new Map(snapshot.entries.map((entry) => [entry.user_id, entry.rank]));
      const changed = new Map<string, RankMove>();
      for (const entry of entries) {
        const old = before.get(entry.user_id);
        if (old !== undefined && old !== entry.rank) changed.set(entry.user_id, entry.rank < old ? "up" : "down");
      }
      if (changed.size) setMoves(changed);
    }
  }

  useEffect(() => {
    if (!moves.size) return;
    const timer = window.setTimeout(() => setMoves(new Map()), 5000);
    return () => window.clearTimeout(timer);
  }, [moves]);

  return moves;
}

/**
 * True for a moment each time `rank` improves (a smaller number) within the same day - the moment worth celebrating.
 * Pass `undefined` while the board on screen is only a placeholder, so it is not compared against.
 */
export function useRankImproved(rank: number | null | undefined, date: string) {
  const [last, setLast] = useState<{ date: string; rank: number | null } | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  if (rank !== undefined && (!last || last.date !== date || last.rank !== rank)) {
    setLast({ date, rank });
    if (last && last.date === date && rank !== null && (last.rank === null || rank < last.rank)) setCelebrating(true);
  }

  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => setCelebrating(false), 2200);
    return () => window.clearTimeout(timer);
  }, [celebrating]);

  return celebrating;
}

/** A "now" that ticks on an interval, so "last paid 3 min ago" stays honest without re-rendering every second. */
export function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

/** A stable hue per driver, so avatars stay the same colour between refreshes and screens. */
export function hueOf(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
