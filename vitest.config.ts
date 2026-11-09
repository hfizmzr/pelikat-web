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
      // denominator covers all 244 src files, not just the 67 loaded by tests.
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      exclude: ["node_modules/", "tests/", "e2e/", "public/"],
      // Full-universe measured floors (verified 2026-11-10 v8 run over all
      // 244 src files, 60 test files / 689 tests): statements 22.10 /
      // branches 21.32 / functions 14.08 / lines 22.49 — rounded down.
      // Thresholds track that run so a silently shrunken test universe or
      // a dropped feature branch fails the gate. (The previous 70/70/65/65
      // gate silently measured only the files tests happen to load.)
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
