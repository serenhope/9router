"use client";

import { create } from "zustand";

// Two modes, both dark-based: glass is the default (a glassmorphism variant
// that keeps the exact same palette while surfaces turn translucent), and solid
// dark stays as the fallback.
export const THEME_IDS = ["glass", "dark"];

function normalize(theme) {
  return THEME_IDS.includes(theme) ? theme : "glass";
}

function getStoredTheme() {
  if (typeof localStorage === "undefined") return "glass";
  try {
    const raw = localStorage.getItem("theme");
    if (!raw) return "glass";
    const parsed = JSON.parse(raw);
    const id = parsed?.state?.theme || parsed?.theme || raw;
    return normalize(id);
  } catch {
    return "glass";
  }
}

function saveStoredTheme(theme) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem("theme", JSON.stringify({ state: { theme: normalize(theme) } }));
  } catch {}
}

const useThemeStore = create((set, get) => ({
  theme: "glass",
  canChangeTheme: true,
  hydrated: false,

  /** Called by the shell with the server value; also used for the SSR default. */
  setServerTheme: (theme, canChange = true) => {
    const id = theme ? normalize(theme) : getStoredTheme();
    set({ theme: id, canChangeTheme: !!canChange, hydrated: true });
    saveStoredTheme(id);
    applyTheme(id);
  },

  /**
   * Applies and persists a new mode. Returns false without touching anything
   * when the session is not allowed to change it (an API-key sign-in), so the
   * control can never repaint the site behind the administrator's back.
   */
  setTheme: (theme) => {
    if (!get().canChangeTheme) return false;
    const id = normalize(theme);
    set({ theme: id });
    saveStoredTheme(id);
    applyTheme(id);

    // Sync to server settings if available (fail-open if unauthenticated or network error)
    if (typeof fetch !== "undefined") {
      fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: id }),
      }).catch(() => {});
    }
    return true;
  },

  toggleTheme: () => get().setTheme(get().theme === "glass" ? "dark" : "glass"),

  initTheme: () => {
    const id = getStoredTheme();
    set({ theme: id });
    applyTheme(id);
  },
}));

// Apply theme to document. "dark" always stays on (both modes are dark);
// "glass" adds the frosted-token overrides in globals.css.
export function applyTheme(theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.classList.add("dark");
  root.classList.toggle("glass", normalize(theme) === "glass");
}

export default useThemeStore;
