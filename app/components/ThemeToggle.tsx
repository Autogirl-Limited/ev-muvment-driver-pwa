"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("ev_muvment_theme", next);
    } catch {}
  }

  return (
    <button className="icon-button theme-toggle" type="button" onClick={toggle} aria-label="Toggle dark mode">
      <Sun className="icon-sun" size={19} />
      <Moon className="icon-moon" size={19} />
    </button>
  );
}
