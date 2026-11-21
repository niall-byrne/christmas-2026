import { defineConfig } from "@playwright/test"
import { E2E_REDIS_URL } from "@/e2e/resources/redis"

const port = 3000

export default defineConfig({
  testDir: "./src/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: "npm run dev:next",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AUTH_SECRET: "playwright-test-auth-secret",
      REDIS_URL: E2E_REDIS_URL,
      GAME_AUTH_RATE_LIMIT_MAX_REQUESTS: "10",
      GAME_AUTH_RATE_LIMIT_WINDOW_SECONDS: "900",
    },
  },
})
