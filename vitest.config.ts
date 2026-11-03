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
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      exclude: ["node_modules/", "tests/", "e2e/", "public/"],
      // Gate pinned to the measured v8 floor (2026-11-03 run of
      // `pnpm test --coverage`: lines 74.5 / statements 72.7 / branches 69.6 /
      // functions 68.7) — rounded down so the gate is a floor, not aspirational.
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 65,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
