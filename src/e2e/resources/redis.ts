import Redis from "ioredis"
import { gameStateChannel } from "@/lib/game/realtimeChannel"
import { redisKeys } from "@/lib/game/redisKeys"

export const E2E_REDIS_URL = "redis://127.0.0.1:6379/15"

export function createTestRedisClient() {
  return new Redis(E2E_REDIS_URL)
}

export async function subscribeToGameStateEvents(gameId: string) {
  const subscriber = createTestRedisClient()
  const channel = gameStateChannel(gameId).name
  const messages: unknown[] = []
  let closed = false
  const waiters: {
    resolve: (message: unknown) => void
    reject: (error: Error) => void
  }[] = []
  const onMessage = (_channel: string, message: string) => {
    const waiter = waiters.shift()
    if (waiter) {
      waiter.resolve(JSON.parse(message))
    } else {
      messages.push(JSON.parse(message))
    }
  }

  subscriber.on("message", onMessage)
  await subscriber.subscribe(channel)

  return {
    nextMessage(timeoutMs = 5_000): Promise<unknown> {
      const message = messages.shift()
      if (message !== undefined) {
        return Promise.resolve(message)
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const index = waiters.indexOf(waiter)
          if (index !== -1) waiters.splice(index, 1)
          reject(new Error(`No game state event arrived within ${timeoutMs}ms`))
        }, timeoutMs)
        const waiter = {
          resolve: (value: unknown) => {
            clearTimeout(timeout)
            resolve(value)
          },
          reject: (error: Error) => {
            clearTimeout(timeout)
            reject(error)
          },
        }
        waiters.push(waiter)
      })
    },
    async hasMessageAfterPing() {
      await subscriber.ping()
      return messages.length > 0
    },
    async close() {
      if (closed) return
      closed = true
      subscriber.removeListener("message", onMessage)
      await subscriber.unsubscribe(channel)
      await subscriber.quit()
    },
  }
}

export async function flushTestRedis() {
  const redis = createTestRedisClient()
  await redis.flushdb()
  await redis.quit()
}

export async function deleteGameRecord(gameId: string) {
  const redis = createTestRedisClient()
  await redis.del(redisKeys.game(gameId))
  await redis.quit()
}

export async function readGameKeyTTLs(gameId: string) {
  const redis = createTestRedisClient()
  const keys = (await redis.keys(`${redisKeys.game(gameId)}*`)).sort()
  const keyTTLs = await Promise.all(
    keys.map(async (key) => ({ key, ttl: await redis.ttl(key) }))
  )
  await redis.quit()
  return keyTTLs
}
