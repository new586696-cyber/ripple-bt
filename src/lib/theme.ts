/** Light/dark/system theme handling, persisted in localStorage. */

export type Theme = "light" | "dark" | "system";
const KEY = "ripple:theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const value = localStorage.getItem(KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function prefersDark() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  if (typeof window !== "undefined") localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

/** Applies the saved theme and keeps "system" in sync with the OS setting. */
export function initTheme() {
  if (typeof window === "undefined") return () => {};
  applyTheme(getStoredTheme());
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getStoredTheme() === "system") applyTheme("system");
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
