import { describe, it, expect } from "vitest";
import { ThemeSchema, FormSchema } from "@/schema/form";
import { THEME_PRESETS, WALLPAPERS, contrastRatio, readableOn, themeToCssVars, themeWarnings } from "./theme";
import { blankForm } from "@/features/builder/factory";

describe("theme configuration", () => {
  it("every preset is a valid canonical theme and works in a form", () => {
    for (const p of THEME_PRESETS) {
      expect(ThemeSchema.safeParse(p.theme).success, p.id).toBe(true);
      const f = { ...blankForm("Themed"), theme: p.theme };
      expect(FormSchema.safeParse(f).success, p.id).toBe(true);
    }
    expect(new Set(THEME_PRESETS.map(p => p.id)).size).toBe(THEME_PRESETS.length);
  });
  it("every preset keeps text and buttons readable", () => {
    for (const p of THEME_PRESETS) {
      const fg = readableOn(p.theme.background);
      expect(contrastRatio(fg, p.theme.background), `${p.id} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(readableOn(p.theme.primary), p.theme.primary), `${p.id} button`).toBeGreaterThanOrEqual(4.5);
      expect(themeWarnings(p.theme), p.id).toEqual([]);
    }
  });
  it("defaults are applied by the canonical schema", () => {
    const t = ThemeSchema.parse({});
    expect(t).toMatchObject({ preset: "classic", fontFamily: expect.any(String), buttonStyle: expect.any(String), progress: expect.any(String) });
  });
  it("rejects out-of-range or malformed theme values", () => {
    expect(ThemeSchema.safeParse({ primary: "blue" }).success).toBe(false);
    expect(ThemeSchema.safeParse({ borderRadius: 999 }).success).toBe(false);
  });
  it("maps the theme to CSS variables with readable foreground colours", () => {
    const vars = themeToCssVars(THEME_PRESETS[1]!.theme) as Record<string, string>;
    expect(vars["--sf-bg"]).toBe("#0f172a");
    expect(vars["--sf-fg"]).toBe("#ffffff");
    expect(vars["--sf-radius"]).toMatch(/px$/);
  });
  it("computes WCAG contrast and warns on low-contrast primaries", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(readableOn("#ffffff")).toBe("#0f172a");
    expect(readableOn("#000000")).toBe("#ffffff");
    expect(themeWarnings(ThemeSchema.parse({ primary: "#fefefe", background: "#ffffff" }))).toHaveLength(1);
    expect(themeWarnings(ThemeSchema.parse({}))).toEqual([]);
  });
});

describe("wallpapers", () => {
  it("default to flat (no background-image), so old published forms render unchanged", () => {
    const parsed = ThemeSchema.parse({});
    expect(parsed.wallpaper).toBe("flat");
    expect(themeToCssVars(parsed)["--sf-wallpaper-image" as never]).toBe("none");
  });

  it("every wallpaper produces CSS vars without throwing, for every preset", () => {
    for (const wp of WALLPAPERS) {
      for (const preset of THEME_PRESETS) {
        const vars = themeToCssVars({ ...preset.theme, wallpaper: wp.id });
        expect(typeof vars["--sf-wallpaper-image" as never]).toBe("string");
      }
    }
  });

  it("non-flat wallpapers derive their colour from the theme, not a fixed value", () => {
    const vars = themeToCssVars(ThemeSchema.parse({ wallpaper: "dots" }));
    expect(vars["--sf-wallpaper-image" as never]).toContain("var(--sf-fg)");
  });
});
