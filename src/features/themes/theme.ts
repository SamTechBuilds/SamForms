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
  { id: "ocean", name: "Ocean", theme: ThemeSchema.parse({ preset: "ocean", background: "#f0f9ff", primary: "#0369a1", secondary: "#0c4a6e", fontFamily: "inter", buttonStyle: "solid", inputStyle: "outlined", borderRadius: 10, progress: "bar" }) },
  { id: "rose", name: "Rose", theme: ThemeSchema.parse({ preset: "rose", background: "#fff1f2", primary: "#be123c", secondary: "#9f1239", fontFamily: "serif", buttonStyle: "pill", inputStyle: "underline", borderRadius: 14, progress: "steps" }) },
  { id: "noir", name: "Noir", theme: ThemeSchema.parse({ preset: "noir", background: "#09090b", primary: "#e4e4e7", secondary: "#a1a1aa", fontFamily: "inter", buttonStyle: "outline", inputStyle: "filled", borderRadius: 4, progress: "percent" }) },
  { id: "paper", name: "Paper", theme: ThemeSchema.parse({ preset: "paper", background: "#fdfbf7", primary: "#8a5a2b", secondary: "#6b5b4b", fontFamily: "serif", buttonStyle: "outline", inputStyle: "underline", borderRadius: 2, progress: "none" }) },
];

/**
 * Background wallpapers for the public form. Every pattern is built from the theme's own
 * colours (no external images), kept subtle (low opacity, thin lines) so it never competes
 * with the contrast already checked for text and buttons against the flat background.
 */
export const WALLPAPERS: { id: Theme["wallpaper"]; name: string }[] = [
  { id: "flat", name: "Flat" },
  { id: "gradient-diagonal", name: "Diagonal gradient" },
  { id: "gradient-radial", name: "Soft glow" },
  { id: "dots", name: "Dot grid" },
  { id: "grid", name: "Line grid" },
  { id: "waves", name: "Waves" },
];

function wallpaperCss(wallpaper: Theme["wallpaper"]): { image: string; size?: string } {
  switch (wallpaper) {
    case "gradient-diagonal":
      return { image: "linear-gradient(135deg, var(--sf-bg) 0%, color-mix(in srgb, var(--sf-primary) 12%, var(--sf-bg)) 100%)" };
    case "gradient-radial":
      return { image: "radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--sf-primary) 16%, var(--sf-bg)) 0%, var(--sf-bg) 55%)" };
    case "dots":
      return { image: "radial-gradient(color-mix(in srgb, var(--sf-fg) 16%, transparent) 1.5px, transparent 1.5px)", size: "20px 20px" };
    case "grid":
      return {
        image: "linear-gradient(color-mix(in srgb, var(--sf-fg) 9%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--sf-fg) 9%, transparent) 1px, transparent 1px)",
        size: "32px 32px",
      };
    case "waves":
      return {
        image: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--sf-secondary) 10%, transparent) 0px, color-mix(in srgb, var(--sf-secondary) 10%, transparent) 2px, transparent 2px, transparent 28px)",
      };
    default:
      return { image: "none" };
  }
}

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
  const wallpaper = wallpaperCss(theme.wallpaper);
  return {
    "--sf-bg": theme.background,
    "--sf-fg": fg,
    "--sf-muted": fg === "#ffffff" ? "rgba(255,255,255,0.7)" : "rgba(15,23,42,0.62)",
    "--sf-primary": theme.primary,
    "--sf-on-primary": readableOn(theme.primary),
    "--sf-secondary": theme.secondary,
    "--sf-radius": `${theme.borderRadius}px`,
    "--sf-font": FONT_STACKS[theme.fontFamily],
    "--sf-wallpaper-image": wallpaper.image,
    "--sf-wallpaper-size": wallpaper.size ?? "auto",
  } as CSSProperties;
}

/** Contrast warnings so admins don't publish unreadable themes. */
export function themeWarnings(theme: Theme): string[] {
  const w: string[] = [];
  if (contrastRatio(theme.primary, theme.background) < 3) w.push("The primary colour has low contrast against the background (buttons and selections may be hard to see).");
  return w;
}
