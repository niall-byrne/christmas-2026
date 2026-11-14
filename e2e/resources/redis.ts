import Redis from "ioredis"

export const E2E_REDIS_URL = "redis://127.0.0.1:6379/15"

export async function flushTestRedis() {
  const redis = new Redis(E2E_REDIS_URL)
  await redis.flushdb()
  await redis.quit()
}
