import { expect, test as base } from "@playwright/test"
import { flushTestRedis } from "@/e2e/resources/redis"

export { expect }

export const test = base.extend<{ resetRedis: void }>({
  resetRedis: [
    async ({}, use) => {
      await flushTestRedis()
      await use()
      await flushTestRedis()
    },
    { auto: true },
  ],
})
