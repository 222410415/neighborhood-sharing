import { defineConfig, devices } from "@playwright/test";

/**
 * E2e test configuration for a locally running app and API.
 * Run with: pnpm test:e2e after starting the app locally
 */
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
