// @vitest-environment node

import { EventEmitter } from "node:events"
import type Redis from "ioredis"
import type { RedisOptions } from "ioredis"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

class MockRedis extends EventEmitter {
  static instances: MockRedis[] = []

  public readonly url: string
  public readonly options: RedisOptions | undefined
  public readonly get = vi.fn(async () => null)

  constructor(url: string, options?: RedisOptions) {
    super()
    this.url = url
    this.options = options
    MockRedis.instances.push(this)
  }
}

vi.mock("ioredis", () => ({
  default: MockRedis,
}))

const { RedisClient } = await import("@/lib/redis")

describe("RedisClient", () => {
  const TEST_FIXTURES = {
    url: "redis://localhost:6379",
    paddedUrl: "  redis://localhost:6379  ",
    missingUrlMessage:
      "REDIS_URL is not configured. Set REDIS_URL in your environment variables.",
  } as const

  function captureThrownError(fn: () => unknown): unknown {
    try {
      fn()
      return undefined
    } catch (err) {
      return err
    }
  }

  function getLastMockInstance(): MockRedis {
    const instance = MockRedis.instances.at(-1)
    expect(instance).toBeDefined()
    return instance as MockRedis
  }

  afterEach(() => {
    MockRedis.instances = []
    globalThis.redisClient = undefined
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe("getClient", () => {
    describe("when REDIS_URL is configured", () => {
      let client: Redis
      let mockInstance: MockRedis

      beforeEach(() => {
        vi.stubEnv("REDIS_URL", TEST_FIXTURES.paddedUrl)
        client = RedisClient.getClient()
        mockInstance = getLastMockInstance()
      })

      it("creates a client with the trimmed URL and Vercel serverless options", () => {
        expect(MockRedis.instances).toHaveLength(1)
        expect(mockInstance.url).toBe(TEST_FIXTURES.url)
        expect(mockInstance.options).toMatchObject({
          connectTimeout: RedisClient.DEFAULT_CONNECT_TIMEOUT_MS,
          maxRetriesPerRequest: RedisClient.DEFAULT_MAX_RETRIES_PER_REQUEST,
          enableReadyCheck: true,
        })
        expect(typeof mockInstance.options?.retryStrategy).toBe("function")
      })

      it("attaches an error listener so socket error events do not crash the process", () => {
        expect(mockInstance.listenerCount("error")).toBeGreaterThanOrEqual(1)

        const socketError = Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        })

        expect(() => mockInstance.emit("error", socketError)).not.toThrow()
      })

      it("returns the same cached singleton instance on subsequent calls", () => {
        const secondClient = RedisClient.getClient()

        expect(secondClient).toBe(client)
        expect(globalThis.redisClient).toBe(client)
        expect(MockRedis.instances).toHaveLength(1)
      })

      it("propagates command rejections without clearing the cached singleton", async () => {
        const readonlyError = Object.assign(
          new Error("READONLY You can't write against a read only replica."),
          { name: "ReplyError", code: "READONLY" }
        )
        mockInstance.get.mockRejectedValueOnce(readonlyError)

        await expect(client.get("game:missing")).rejects.toThrow(readonlyError)
        expect(RedisClient.getClient()).toBe(client)
        expect(MockRedis.instances).toHaveLength(1)
      })
    })

    describe("when globalThis.redisClient is already populated (HMR / warm container)", () => {
      let existingClient: MockRedis
      let resolvedClient: Redis

      beforeEach(() => {
        existingClient = new MockRedis(TEST_FIXTURES.url)
        MockRedis.instances = []
        globalThis.redisClient = existingClient as unknown as Redis
        resolvedClient = RedisClient.getClient()
      })

      it("reuses the existing global client without constructing a new Redis connection", () => {
        expect(resolvedClient).toBe(existingClient)
        expect(MockRedis.instances).toHaveLength(0)
      })
    })

    describe("retryStrategy backoff", () => {
      interface RetryDelayCase {
        attempt: number
        expectedDelayMs: number
      }

      const RETRY_DELAY_CASES: RetryDelayCase[] = [
        { attempt: 1, expectedDelayMs: 100 },
        { attempt: 2, expectedDelayMs: 200 },
        { attempt: 10, expectedDelayMs: RedisClient.MAX_RETRY_DELAY_MS },
        { attempt: 25, expectedDelayMs: RedisClient.MAX_RETRY_DELAY_MS },
      ]

      let retryStrategy: (times: number) => number

      beforeEach(() => {
        vi.stubEnv("REDIS_URL", TEST_FIXTURES.url)
        RedisClient.getClient()
        const mockInstance = getLastMockInstance()
        retryStrategy = mockInstance.options?.retryStrategy as (
          times: number
        ) => number
      })

      it.each(RETRY_DELAY_CASES)(
        "returns $expectedDelayMs ms on attempt $attempt",
        ({ attempt, expectedDelayMs }) => {
          expect(retryStrategy(attempt)).toBe(expectedDelayMs)
        }
      )
    })

    describe("when REDIS_URL is missing or whitespace-only", () => {
      interface MissingUrlCase {
        label: string
        envValue: string | undefined
      }

      const MISSING_URL_CASES: MissingUrlCase[] = [
        { label: "undefined", envValue: undefined },
        { label: "empty string", envValue: "" },
        { label: "whitespace-only string", envValue: "   \t\n  " },
      ]

      describe.each(MISSING_URL_CASES)("given $label", ({ envValue }) => {
        let thrown: unknown

        beforeEach(() => {
          vi.stubEnv("REDIS_URL", envValue)
          thrown = captureThrownError(() => RedisClient.getClient())
        })

        it("throws a configuration error without constructing a Redis client", () => {
          expect(thrown).toBeInstanceOf(Error)
          expect((thrown as Error).message).toBe(
            TEST_FIXTURES.missingUrlMessage
          )
          expect(MockRedis.instances).toHaveLength(0)
          expect(globalThis.redisClient).toBeUndefined()
        })
      })
    })
  })
})
