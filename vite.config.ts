import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vendor code is split into stable named chunks so the app shell stays small and
// browsers can cache libraries separately from application changes.
const VENDOR_GROUPS: Array<[string, RegExp]> = [
  ["vendor-react", /node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//],
  ["vendor-supabase", /node_modules\/(@supabase|@supabase\/[^/]+)\//],
  ["vendor-query", /node_modules\/@tanstack\//],
  ["vendor-ui", /node_modules\/(@radix-ui|sonner|lucide-react|class-variance-authority|clsx|tailwind-merge)\//],
  ["vendor-dnd", /node_modules\/@dnd-kit\//],
  ["vendor-validation", /node_modules\/(zod)\//],
];

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    // The largest chunks are the document parsers (exceljs, pdf.js and its worker). They are only
    // imported when a user uploads a file, so they never load on the form or dashboard paths.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          for (const [name, pattern] of VENDOR_GROUPS) {
            if (pattern.test(id)) return name;
          }
          return undefined;
        },
      },
    },
  },
});
