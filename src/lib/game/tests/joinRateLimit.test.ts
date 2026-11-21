// @vitest-environment node

import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiErrorCode } from "@/contracts/gameData"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { GameAuthRateLimiter } from "@/lib/game/joinRateLimit"
import { RedisClient } from "@/lib/redis/client"
import type Redis from "ioredis"

describe("game auth rate limiting", () => {
  const TEST_FIXTURES = {
    ip: "203.0.113.8",
    otherIp: "198.51.100.15",
  } as const

  let evalSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    evalSpy = vi.fn().mockResolvedValue(1)
    vi.spyOn(RedisClient, "getClient").mockReturnValue({
      eval: evalSpy,
    } as unknown as Redis)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const limiter = new GameAuthRateLimiter()

  describe("when resolving the client IP address", () => {
    it("uses the first Vercel-provided client IP", async () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-vercel-forwarded-for": `${TEST_FIXTURES.ip}, 10.0.0.1`,
        },
      })

      await limiter.enforce(request)

      expect(evalSpy.mock.calls[0][2]).toContain(
        createHash("sha256").update(TEST_FIXTURES.ip).digest("hex")
      )
    })

    it("rejects a malformed forwarded IP address", async () => {
      const request = new Request("http://localhost", {
        headers: { "x-vercel-forwarded-for": "not-an-ip" },
      })

      await expect(limiter.enforce(request)).rejects.toThrow(
        "A valid client IP address is required for game auth"
      )
      expect(evalSpy).not.toHaveBeenCalled()
    })

    it("requires a forwarded IP in production", async () => {
      vi.stubEnv("NODE_ENV", "production")

      await expect(
        limiter.enforce(new Request("http://localhost"))
      ).rejects.toThrow("A valid client IP address is required for game auth")
      expect(evalSpy).not.toHaveBeenCalled()
    })

    it("uses a stable local bucket outside production", async () => {
      vi.stubEnv("NODE_ENV", "test")

      await limiter.enforce(new Request("http://localhost"))

      expect(evalSpy.mock.calls[0][2]).toContain(
        createHash("sha256").update("local-development").digest("hex")
      )
    })
  })

  describe("when reading rate-limit configuration", () => {
    it("uses ten requests per fifteen minutes by default", async () => {
      await limiter.enforce(
        new Request("http://localhost", {
          headers: { "x-vercel-forwarded-for": TEST_FIXTURES.ip },
        })
      )

      expect(evalSpy.mock.calls[0].slice(3)).toEqual(["10", "900"])
    })

    it("uses configured request limits", async () => {
      vi.stubEnv("GAME_AUTH_RATE_LIMIT_MAX_REQUESTS", "4")
      vi.stubEnv("GAME_AUTH_RATE_LIMIT_WINDOW_SECONDS", "120")

      await limiter.enforce(
        new Request("http://localhost", {
          headers: { "x-vercel-forwarded-for": TEST_FIXTURES.ip },
        })
      )

      expect(evalSpy.mock.calls[0].slice(3)).toEqual(["4", "120"])
    })

    it("rejects invalid rate-limit configuration", async () => {
      vi.stubEnv("GAME_AUTH_RATE_LIMIT_MAX_REQUESTS", "0")

      await expect(
        limiter.enforce(
          new Request("http://localhost", {
            headers: { "x-vercel-forwarded-for": TEST_FIXTURES.ip },
          })
        )
      ).rejects.toThrow("Game auth rate-limit configuration is invalid")
      expect(evalSpy).not.toHaveBeenCalled()
    })
  })

  describe("when an IP is checked against the shared Redis limit", () => {
    it("increments the hashed IP bucket with the configured window", async () => {
      vi.stubEnv("GAME_AUTH_RATE_LIMIT_MAX_REQUESTS", "4")
      vi.stubEnv("GAME_AUTH_RATE_LIMIT_WINDOW_SECONDS", "120")

      await limiter.enforce(
        new Request("http://localhost", {
          headers: { "x-vercel-forwarded-for": TEST_FIXTURES.ip },
        })
      )

      expect(evalSpy).toHaveBeenCalledOnce()
      expect(evalSpy.mock.calls[0][1]).toBe(1)
      expect(evalSpy.mock.calls[0][2]).toBe(
        `rate-limit:game-auth:test:${createHash("sha256")
          .update(TEST_FIXTURES.ip)
          .digest("hex")}`
      )
      expect(evalSpy.mock.calls[0].slice(3)).toEqual(["4", "120"])
    })

    it("returns a rate-limit error when the shared IP bucket is exhausted", async () => {
      evalSpy.mockResolvedValue(0)

      await expect(
        limiter.enforce(
          new Request("http://localhost", {
            headers: {
              "x-vercel-forwarded-for": TEST_FIXTURES.otherIp,
            },
          })
        )
      ).rejects.toMatchObject({
        error: ApiErrorCode.RATE_LIMITED,
        statusCode: 429,
        headers: { "Retry-After": "900" },
      } satisfies Partial<ApiRouteError>)
    })

    it("reports an unexpected Redis result", async () => {
      evalSpy.mockResolvedValue("invalid")

      await expect(
        limiter.enforce(
          new Request("http://localhost", {
            headers: { "x-vercel-forwarded-for": TEST_FIXTURES.ip },
          })
        )
      ).rejects.toThrow("Game auth rate limiter returned an invalid result")
    })
  })
})
