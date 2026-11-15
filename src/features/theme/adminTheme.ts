import { useSyncExternalStore } from "react";

// Colour mode and accent for the admin app. Stored per browser; the form's own theme (public pages) is separate and unaffected.

export const THEME_MODES = ["light", "dark", "system"] as const;
export type AdminThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = "light" | "dark";
export const THEME_STORAGE_KEY = "sam-forms.theme";

export const ADMIN_ACCENTS = ["blue", "violet", "emerald", "rose", "amber"] as const;
export type AdminAccent = (typeof ADMIN_ACCENTS)[number];
export const ACCENT_STORAGE_KEY = "sam-forms.accent";
/** Swatch colour for each accent's picker button (matches its light-mode --primary). */
export const ACCENT_SWATCH: Record<AdminAccent, string> = {
  blue: "#1d4ed8", violet: "#5b14d7", emerald: "#188150", rose: "#b5173c", amber: "#a66707",
};

export function isThemeMode(value: unknown): value is AdminThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

export function isAdminAccent(value: unknown): value is AdminAccent {
  return typeof value === "string" && (ADMIN_ACCENTS as readonly string[]).includes(value);
}

export function resolveTheme(mode: AdminThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

function systemQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
}

function readStored(): AdminThemeMode {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : "system";
  } catch {
    // Storage can be blocked (private mode, strict settings). Fall back to the system setting.
    return "system";
  }
}

function readStoredAccent(): AdminAccent {
  try {
    const value = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAdminAccent(value) ? value : "violet";
  } catch {
    return "violet";
  }
}

function applyToDocument(mode: AdminThemeMode, accent: AdminAccent): void {
  const resolved = resolveTheme(mode, systemQuery()?.matches ?? false);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.dataset.accent = accent;
  root.style.colorScheme = resolved;
}

let current: AdminThemeMode = "system";
let currentAccent: AdminAccent = "violet";
const listeners = new Set<() => void>();
const accentListeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(listener => listener());
}
function emitAccent(): void {
  accentListeners.forEach(listener => listener());
}

/** Call once before the first render so the page never flashes the wrong colours. */
export function initAdminTheme(): void {
  current = readStored();
  currentAccent = readStoredAccent();
  applyToDocument(current, currentAccent);
  systemQuery()?.addEventListener("change", () => {
    if (current === "system") applyToDocument(current, currentAccent);
  });
}

export function setAdminThemeMode(mode: AdminThemeMode): void {
  current = mode;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Not persisted; the choice still applies for this visit.
  }
  applyToDocument(current, currentAccent);
  emit();
}

export function setAdminAccent(accent: AdminAccent): void {
  currentAccent = accent;
  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  } catch {
    // Not persisted; the choice still applies for this visit.
  }
  applyToDocument(current, currentAccent);
  emitAccent();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function subscribeAccent(listener: () => void): () => void {
  accentListeners.add(listener);
  return () => accentListeners.delete(listener);
}

/** Shared by every toggle on the page (desktop and mobile navigation stay in sync). */
export function useAdminThemeMode(): AdminThemeMode {
  return useSyncExternalStore(subscribe, () => current, () => "system");
}

export function useAdminAccent(): AdminAccent {
  return useSyncExternalStore(subscribeAccent, () => currentAccent, () => "violet");
}
