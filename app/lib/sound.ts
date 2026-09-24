import { useSyncExternalStore } from "react";

const SRC = "/sound/autogirl_notification_sound.mp3";
const KEY = "ev-notification-sound";
const listeners = new Set<() => void>();

let audio: HTMLAudioElement | null = null;
let unlocked = false;

function element() {
  if (!audio && typeof Audio !== "undefined") {
    audio = new Audio(SRC);
    audio.preload = "auto";
  }
  return audio;
}

function read() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(KEY, enabled ? "on" : "off");
  } catch {
    /* private mode: the toggle just won't persist */
  }
  listeners.forEach((listener) => listener());
}

export function useSoundEnabled() {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    read,
    () => true,
  );
}

/**
 * Browsers only allow sound after the user has touched the page. Call this from the first tap or key
 * press: it plays the clip silently once, so later alerts are allowed to make noise.
 */
export function unlockSound() {
  const el = element();
  if (!el || unlocked) return;
  el.muted = true;
  el.play()
    .then(() => {
      el.pause();
      el.currentTime = 0;
      el.muted = false;
      unlocked = true;
    })
    .catch(() => {
      el.muted = false;
    });
}

export function playNotificationSound() {
  if (!read()) return;
  const el = element();
  if (!el) return;
  el.currentTime = 0;
  void el.play().catch(() => {
    /* still locked: the toast and badge carry the message */
  });
}
