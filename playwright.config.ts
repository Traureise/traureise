import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// The second instance from docker-compose.e2e.yml, with billing on against the Creem stub.
const billingURL = process.env.E2E_BILLING_URL ?? "http://localhost:3001";
const BILLING_SPECS = /\.billing\.spec\.ts$/;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    { name: "chromium", testIgnore: BILLING_SPECS, use: { ...devices["Desktop Chrome"] } },
    { name: "billing", testMatch: BILLING_SPECS, use: { ...devices["Desktop Chrome"], baseURL: billingURL } },
  ],
});
