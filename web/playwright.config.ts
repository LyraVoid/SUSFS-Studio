import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:5177",
    viewport: { width: 360, height: 805 },
    contextOptions: { reducedMotion: "reduce" },
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5177 --strictPort",
    url: "http://127.0.0.1:5177",
  },
});
