import { defineConfig, devices } from "@playwright/test";
import { existsSync, statSync } from "node:fs";

const port = Number(process.env.PORT ?? 3000);

/**
 * Use a pre-installed Chromium when Playwright's own download isn't available
 * (CI images often pin one). Falls back to Playwright's default otherwise.
 */
function preinstalledChromium(): string | undefined {
  const candidates = [
    process.env.PW_CHROMIUM,
    "/opt/pw-browsers/chromium",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}
const executablePath = preinstalledChromium();
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    launchOptions,
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
  ],
  webServer: {
    command: process.env.PW_NO_BUILD ? `npm run start -- -p ${port}` : `npm run build && npm run start -- -p ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Placeholder Supabase values so client code can mount; e2e tests mock /api/*.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_test",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    },
  },
});
