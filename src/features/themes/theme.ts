import type { CSSProperties } from "react";
import { ThemeSchema, type FormDefinition } from "@/schema/form";

export type Theme = FormDefinition["theme"];

/** Professional presets. Every preset is a complete canonical ThemeSchema value (tested). */
export const THEME_PRESETS: { id: string; name: string; theme: Theme }[] = [
  { id: "classic", name: "Classic", theme: ThemeSchema.parse({ preset: "classic" }) },
  { id: "midnight", name: "Midnight", theme: ThemeSchema.parse({ preset: "midnight", background: "#0f172a", primary: "#38bdf8", secondary: "#94a3b8", fontFamily: "inter", buttonStyle: "solid", inputStyle: "underline", borderRadius: 10, progress: "bar" }) },
  { id: "forest", name: "Forest", theme: ThemeSchema.parse({ preset: "forest", background: "#f3f7f2", primary: "#2f6b3f", secondary: "#5f7a63", fontFamily: "serif", buttonStyle: "solid", inputStyle: "outlined", borderRadius: 6, progress: "steps" }) },
  { id: "sunset", name: "Sunset", theme: ThemeSchema.parse({ preset: "sunset", background: "#fff7ed", primary: "#ea580c", secondary: "#9a3412", fontFamily: "rounded", buttonStyle: "pill", inputStyle: "filled", borderRadius: 16, progress: "percent" }) },
  { id: "mono", name: "Minimal mono", theme: ThemeSchema.parse({ preset: "mono", background: "#fafafa", primary: "#111111", secondary: "#6b7280", fontFamily: "mono", buttonStyle: "outline", inputStyle: "underline", borderRadius: 0, progress: "bar" }) },
  { id: "lavender", name: "Lavender", theme: ThemeSchema.parse({ preset: "lavender", background: "#f5f3ff", primary: "#7c3aed", secondary: "#6d28d9", fontFamily: "inter", buttonStyle: "pill", inputStyle: "outlined", borderRadius: 12, progress: "steps" }) },
];

export const FONT_STACKS: Record<Theme["fontFamily"], string> = {
  inter: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", Nunito, "Segoe UI", system-ui, sans-serif',
};

function luminance(hex: string): number {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
/** Readable text colour for a background (WCAG-based). */
export const readableOn = (bg: string) => (contrastRatio(bg, "#0f172a") >= contrastRatio(bg, "#ffffff") ? "#0f172a" : "#ffffff");

/** Single mapping from the canonical theme to CSS custom properties used by the preview/renderer. */
export function themeToCssVars(theme: Theme): CSSProperties {
  const fg = readableOn(theme.background);
  return {
    "--sf-bg": theme.background,
    "--sf-fg": fg,
    "--sf-muted": fg === "#ffffff" ? "rgba(255,255,255,0.7)" : "rgba(15,23,42,0.62)",
    "--sf-primary": theme.primary,
    "--sf-on-primary": readableOn(theme.primary),
    "--sf-secondary": theme.secondary,
    "--sf-radius": `${theme.borderRadius}px`,
    "--sf-font": FONT_STACKS[theme.fontFamily],
  } as CSSProperties;
}

/** Contrast warnings so admins don't publish unreadable themes. */
export function themeWarnings(theme: Theme): string[] {
  const w: string[] = [];
  if (contrastRatio(theme.primary, theme.background) < 3) w.push("The primary colour has low contrast against the background (buttons and selections may be hard to see).");
  return w;
}
