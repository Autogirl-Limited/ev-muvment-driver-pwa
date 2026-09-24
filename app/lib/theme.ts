export type Theme = "light" | "dark";

export const THEME_KEY = "ev_muvment_theme";

// Must match --background in globals.css so the device status/navigation bars blend with the app.
export const THEME_COLORS: Record<Theme, string> = { light: "#f6f8fd", dark: "#04060b" };

/** Points every theme-color tag at the current theme, without saving anything. */
export function syncThemeColor() {
  const color = THEME_COLORS[currentTheme()];
  const tags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (tags.length) {
    tags.forEach((tag) => (tag.content = color));
    return;
  }
  const tag = document.createElement("meta");
  tag.name = "theme-color";
  tag.content = color;
  document.head.appendChild(tag);
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  syncThemeColor();
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
