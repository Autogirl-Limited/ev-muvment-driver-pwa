"use client";

import { Moon, Sun } from "lucide-react";
import { applyTheme, currentTheme } from "../lib/theme";

export function ThemeToggle() {
  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      onClick={() => applyTheme(currentTheme() === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
    >
      <Sun className="icon-sun" size={19} />
      <Moon className="icon-moon" size={19} />
    </button>
  );
}
