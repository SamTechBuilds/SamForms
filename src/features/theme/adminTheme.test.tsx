// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ACCENT_STORAGE_KEY, isAdminAccent, isThemeMode, resolveTheme, setAdminAccent, setAdminThemeMode, THEME_STORAGE_KEY } from "./adminTheme";
import { AccentPicker, ThemeToggle } from "./ThemeToggle";

describe("admin colour mode", () => {
  it("recognises only the three stored modes", () => {
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("purple")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  it("resolves system mode from the operating system setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  it("applies the dark class and remembers the choice", () => {
    setAdminThemeMode("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    setAdminThemeMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("the toggle reflects and changes the mode", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("admin accent colour", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
    delete document.documentElement.dataset.accent;
  });

  it("recognises only the five supported accents", () => {
    expect(isAdminAccent("violet")).toBe(true);
    expect(isAdminAccent("teal")).toBe(false);
  });

  it("applies the accent attribute and remembers the choice", () => {
    setAdminAccent("rose");
    expect(document.documentElement.dataset.accent).toBe("rose");
    expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBe("rose");
  });

  it("the picker reflects and changes the accent, independently of colour mode", () => {
    render(<AccentPicker />);
    fireEvent.click(screen.getByRole("button", { name: "emerald accent" }));
    expect(screen.getByRole("button", { name: "emerald accent" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.accent).toBe("emerald");
  });
});
