import { createSignal } from "solid-js";

export type Theme = "dark" | "light";

const STORAGE_KEY = "ai-memory-ui-theme";

function hasDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function initialTheme(): Theme {
  if (!hasDom()) {
    return "light";
  }
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") {
    return saved;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  if (!hasDom()) {
    return;
  }
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

const [theme, setThemeSignal] = createSignal<Theme>(initialTheme());
applyTheme(theme());

export { theme };

export function setTheme(next: Theme): void {
  setThemeSignal(next);
  if (hasDom()) {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  applyTheme(next);
}

export function toggleTheme(): void {
  setTheme(theme() === "dark" ? "light" : "dark");
}
