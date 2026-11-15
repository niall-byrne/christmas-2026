import "server-only"
import { createHash } from "node:crypto"
import { isIP } from "node:net"
import { ApiErrorCode } from "@/contracts/gameData"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { RedisClient } from "@/lib/redis/client"

export class GameAuthRateLimiter {
  protected readonly reserveAttemptScript = `
    local current = tonumber(redis.call("GET", KEYS[1]) or "0")
    local maximum = tonumber(ARGV[1])

    if current >= maximum then
      return 0
    end

    local updated = redis.call("INCR", KEYS[1])
    if updated == 1 then
      redis.call("EXPIRE", KEYS[1], ARGV[2])
    end

    return 1
  `
  protected readonly defaultMaxRequests = 10
  protected readonly defaultWindowSeconds = 900

  protected getConfig() {
    const maxRequests = Number(
      process.env.GAME_AUTH_RATE_LIMIT_MAX_REQUESTS ?? this.defaultMaxRequests
    )
    const windowSeconds = Number(
      process.env.GAME_AUTH_RATE_LIMIT_WINDOW_SECONDS ??
        this.defaultWindowSeconds
    )

    if (
      !Number.isSafeInteger(maxRequests) ||
      maxRequests < 1 ||
      !Number.isSafeInteger(windowSeconds) ||
      windowSeconds < 1
    ) {
      throw new Error("Game auth rate-limit configuration is invalid")
    }

    return { maxRequests, windowSeconds }
  }

  protected getClientIp(request: Pick<Request, "headers">): string {
    const forwardedIp =
      request.headers.get("x-vercel-forwarded-for") ??
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip")
    const candidate = forwardedIp?.split(",")[0]?.trim()

    if (candidate && isIP(candidate) !== 0) {
      return candidate
    }

    if (!candidate && process.env.NODE_ENV !== "production") {
      return "local-development"
    }

    throw new Error("A valid client IP address is required for game auth")
  }

  protected getKey(ip: string): string {
    const ipHash = createHash("sha256").update(ip).digest("hex")
    const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV
    return `rate-limit:game-auth:${environment}:${ipHash}`
  }

  async enforce(request: Pick<Request, "headers">): Promise<void> {
    const { maxRequests, windowSeconds } = this.getConfig()
    const ip = this.getClientIp(request)
    const result: unknown = await RedisClient.getClient().eval(
      this.reserveAttemptScript,
      1,
      this.getKey(ip),
      String(maxRequests),
      String(windowSeconds)
    )

    if (result === 1 || result === "1") {
      return
    }

    if (result !== 0 && result !== "0") {
      throw new Error("Game auth rate limiter returned an invalid result")
    }

    throw new ApiRouteError(ApiErrorCode.RATE_LIMITED, 429, undefined, {
      "Retry-After": String(windowSeconds),
    })
  }
}

export const gameAuthRateLimiter = new GameAuthRateLimiter()
