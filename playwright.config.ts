import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Keep browser runs away from the operator's default application library.
const e2eDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lindyloop-e2e-"));

const serverEnvironment = {
  ...process.env,
  LINDYLOOP_DATA_DIR: e2eDataDirectory,
  LINDYLOOP_API_PORT: "5174",
};

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "dot" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      // Use the non-watch TypeScript loader so the test server does not need
      // tsx's IPC pipe (watch mode is intended for interactive development).
      command: "node --import tsx server/index.ts",
      url: "http://127.0.0.1:5174/api/health",
      cwd: path.resolve("."),
      env: serverEnvironment,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:web",
      url: "http://127.0.0.1:5173",
      cwd: path.resolve("."),
      env: serverEnvironment,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
