import { describe, it, expect, beforeEach } from "vitest"
import type { RedisErrorMetadata } from "@/contracts/api"
import { RedisErrorExtractor } from "@/lib/api/error/redis"

describe("RedisErrorExtractor", () => {
  describe("isRedisError", () => {
    it("returns true for ReplyError instances, ioredis command errors, and Redis socket codes", () => {
      const replyErr = Object.assign(new Error("ERR unknown command"), {
        name: "ReplyError",
      })
      const commandErr = Object.assign(new Error("Command timed out"), {
        command: { name: "hgetall", args: ["game:123"] },
      })
      const socketErr = Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      })

      expect(RedisErrorExtractor.isRedisError(replyErr)).toBe(true)
      expect(RedisErrorExtractor.isRedisError(commandErr)).toBe(true)
      expect(RedisErrorExtractor.isRedisError(socketErr)).toBe(true)
    })

    it("returns false for non-Redis errors that happen to carry unrelated code or command fields", () => {
      const fsErr = Object.assign(new Error("ENOENT: no such file"), {
        code: "ENOENT",
      })
      const cliErr = Object.assign(new Error("Subcommand failed"), {
        command: { name: "build" },
      })

      expect(RedisErrorExtractor.isRedisError(fsErr)).toBe(false)
      expect(RedisErrorExtractor.isRedisError(cliErr)).toBe(false)
      expect(RedisErrorExtractor.isRedisError(new Error("Generic"))).toBe(false)
      expect(RedisErrorExtractor.isRedisError(null)).toBe(false)
    })
  })

  describe("extract", () => {
    describe("when given an ioredis ReplyError with command name and args", () => {
      let result: RedisErrorMetadata

      beforeEach(() => {
        const redisErr = Object.assign(
          new Error("NOSCRIPT No matching script. Please use EVAL."),
          {
            name: "ReplyError",
            code: "NOSCRIPT",
            command: {
              name: "evalsha",
              args: ["sha1", "2", "game:secret", "super-secret-password"],
            },
          }
        )
        result = RedisErrorExtractor.extract(redisErr)
      })

      it("extracts code and uppercased command name without exposing command args", () => {
        expect(result).toEqual({
          code: "NOSCRIPT",
          command: "EVALSHA",
        })
        expect(JSON.stringify(result)).not.toContain("super-secret-password")
      })
    })

    describe("when given a Redis socket connection error with only a code property", () => {
      let result: RedisErrorMetadata

      beforeEach(() => {
        const connErr = Object.assign(new Error("connect ECONNREFUSED"), {
          code: "  ECONNREFUSED  ",
        })
        result = RedisErrorExtractor.extract(connErr)
      })

      it("extracts the trimmed code property", () => {
        expect(result).toEqual({ code: "ECONNREFUSED" })
      })
    })

    describe.each([
      [
        "a non-Redis Error with an unrelated code",
        Object.assign(new Error("File missing"), { code: "ENOENT" }),
      ],
      ["a standard Error without Redis fields", new Error("Generic failure")],
      ["a string throwable", "redis down"],
      ["null", null],
      ["undefined", undefined],
    ])("when given %s", (_label, input) => {
      let result: RedisErrorMetadata

      beforeEach(() => {
        result = RedisErrorExtractor.extract(input)
      })

      it("returns an empty metadata object", () => {
        expect(result).toEqual({})
      })
    })
  })
})
