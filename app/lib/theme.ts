export type Theme = "light" | "dark";

export const THEME_KEY = "ev_muvment_theme";

// Must match --background in globals.css so the device status/navigation bars blend with the app.
export const THEME_COLORS: Record<Theme, string> = { light: "#f6f8fd", dark: "#04060b" };

/** Points the browser's theme-color at the current theme, without saving anything. */
export function syncThemeColor() {
  const theme = currentTheme();
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  syncThemeColor();
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
