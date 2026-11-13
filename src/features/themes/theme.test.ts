import { describe, it, expect } from "vitest";
import { ThemeSchema, FormSchema } from "@/schema/form";
import { THEME_PRESETS, contrastRatio, readableOn, themeToCssVars, themeWarnings } from "./theme";
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
