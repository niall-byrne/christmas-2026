import type { RedisErrorMetadata } from "@/contracts/api"

export class RedisErrorExtractor {
  protected static readonly REDIS_ERROR_CODES = new Set([
    "NOSCRIPT",
    "READONLY",
    "LOADING",
    "BUSY",
    "NOREPLICAS",
    "WRONGPASS",
    "NOAUTH",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ECONNRESET",
    "ENOTFOUND",
  ])

  static isRedisError(err: unknown): err is object {
    if (typeof err !== "object" || err === null) {
      return false
    }

    const candidate = err as {
      name?: unknown
      code?: unknown
      command?: unknown
    }

    if (candidate.name === "ReplyError") {
      return true
    }

    if (
      typeof candidate.command === "object" &&
      candidate.command !== null &&
      "name" in candidate.command &&
      "args" in candidate.command &&
      typeof (candidate.command as { name?: unknown }).name === "string" &&
      Array.isArray((candidate.command as { args?: unknown }).args)
    ) {
      return true
    }

    if (
      typeof candidate.code === "string" &&
      RedisErrorExtractor.REDIS_ERROR_CODES.has(candidate.code.trim())
    ) {
      return true
    }

    return false
  }

  static extract(err: unknown): RedisErrorMetadata {
    if (!RedisErrorExtractor.isRedisError(err)) {
      return {}
    }

    const candidate = err as {
      code?: unknown
      command?: { name?: unknown }
    }

    const code =
      typeof candidate.code === "string" && candidate.code.trim()
        ? candidate.code.trim()
        : undefined

    const command =
      candidate.command &&
      typeof candidate.command === "object" &&
      typeof candidate.command.name === "string" &&
      candidate.command.name.trim()
        ? candidate.command.name.trim().toUpperCase()
        : undefined

    return {
      ...(code ? { code } : {}),
      ...(command ? { command } : {}),
    }
  }
}
