import Redis from "ioredis"
import { redisKeys } from "@/lib/game/redisKeys"

export const E2E_REDIS_URL = "redis://127.0.0.1:6379/15"

export async function flushTestRedis() {
  const redis = new Redis(E2E_REDIS_URL)
  await redis.flushdb()
  await redis.quit()
}

export async function deleteGameRecord(gameId: string) {
  const redis = new Redis(E2E_REDIS_URL)
  await redis.del(redisKeys.game(gameId))
  await redis.quit()
}

export async function readGameKeyTTLs(gameId: string) {
  const redis = new Redis(E2E_REDIS_URL)
  const keys = await redis.keys(`${redisKeys.game(gameId)}*`)
  const keyTTLs = await Promise.all(
    keys.map(async (key) => ({ key, ttl: await redis.ttl(key) }))
  )
  await redis.quit()
  return keyTTLs
}
