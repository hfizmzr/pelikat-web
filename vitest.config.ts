import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "e2e"],
    coverage: {
      provider: "v8",
      // Full-universe gate: restrict instrumentation to src so the percent
      // denominator covers all 245 src files, not just the 67 loaded by tests.
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      exclude: ["node_modules/", "tests/", "e2e/", "public/"],
      // Full-universe measured floors (2026-11-03 v8 run with the include
      // above): lines 22.14 / statements 21.76 / branches 21.07 / functions
      // 13.79 — rounded down. (The previous 70/70/65/65 gate silently
      // measured only the files tests happen to load.)
      thresholds: {
        statements: 21,
        branches: 21,
        functions: 13,
        lines: 22,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
