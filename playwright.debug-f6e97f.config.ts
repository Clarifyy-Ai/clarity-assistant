import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "off",
    screenshot: "off",
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
