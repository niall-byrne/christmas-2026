import "server-only"
import Redis from "ioredis"

export class RedisClient {
  static readonly DEFAULT_CONNECT_TIMEOUT_MS = 5_000
  static readonly DEFAULT_MAX_RETRIES_PER_REQUEST = 1
  static readonly MAX_RETRY_DELAY_MS = 1_000
  static readonly RETRY_STEP_MS = 100

  protected constructor() {}

  static getClient(): Redis {
    if (!globalThis.redisClient) {
      const url = RedisClient.resolveUrl()
      const client = new Redis(url, {
        connectTimeout: RedisClient.DEFAULT_CONNECT_TIMEOUT_MS,
        maxRetriesPerRequest: RedisClient.DEFAULT_MAX_RETRIES_PER_REQUEST,
        enableReadyCheck: true,
        retryStrategy: RedisClient.retryStrategy,
      })

      client.on("error", () => {})
      globalThis.redisClient = client
    }

    return globalThis.redisClient
  }

  protected static resolveUrl(): string {
    const url = process.env.REDIS_URL?.trim()
    if (!url) {
      throw new Error(
        "REDIS_URL is not configured. Set REDIS_URL in your environment variables."
      )
    }
    return url
  }

  protected static retryStrategy(times: number): number {
    return Math.min(
      times * RedisClient.RETRY_STEP_MS,
      RedisClient.MAX_RETRY_DELAY_MS
    )
  }
}
