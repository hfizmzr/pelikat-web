import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /pwa-.*\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "PWA (Prod Build)",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: "pnpm build && PORT=3001 pnpm start",
    url: "http://localhost:3001",
    timeout: 180000,
    reuseExistingServer: false,
  },
});
