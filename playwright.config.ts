import { defineConfig } from "@playwright/test";
import fs from "node:fs";

// Uses the system Chrome when present (the bundled Chromium download is not always reachable).
const systemChrome = "/usr/bin/google-chrome";
const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: fs.existsSync(systemChrome) ? { executablePath: systemChrome } : {},
  },
  projects: [{ name: "chrome", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } }],
  webServer: {
    // Supabase values are compile-time. These placeholders keep the build offline; every backend call is mocked in the specs.
    command: `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
