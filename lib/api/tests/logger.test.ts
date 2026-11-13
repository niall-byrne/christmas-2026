// @vitest-environment node

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest"
import type {
  ApiLoggerOptionProps,
  StructuredApiLogPayload,
} from "@/contracts/api"
import { ApiLogger } from "@/lib/api/logger"

const TEST_FIXTURES = {
  timestamp: "2026-11-12T21:50:00.123Z",
  service: "my-web-app",
  environment: "production",
  requestId: "iad1::98765-1731448200-abcde",
  fallbackRequestId: "fallback-req-id",
  gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
  teamId: "z9y8x7w6v5u4t3s2r1q0p9o8",
  playerId: "m1n2b3v4c5x6z7l8k9j0h1g2",
  gamesUrl: "http://localhost:3000/api/games",
  http: {
    method: "POST",
    path: "/api/games",
    statusCode: 500,
    durationMs: 12,
  },
} as const

function createTestLogger(options: ApiLoggerOptionProps = {}): ApiLogger {
  return new ApiLogger({
    service: TEST_FIXTURES.service,
    environment: TEST_FIXTURES.environment,
    ...options,
  })
}

function buildExpectedPayload(
  overrides: Partial<StructuredApiLogPayload> &
    Pick<StructuredApiLogPayload, "level" | "message">
): StructuredApiLogPayload {
  return {
    timestamp: TEST_FIXTURES.timestamp,
    service: TEST_FIXTURES.service,
    environment: TEST_FIXTURES.environment,
    requestId: ApiLogger.MISSING_REQUEST_ID,
    ...overrides,
  }
}

function parseLoggedLine(spy: MockInstance): StructuredApiLogPayload {
  expect(spy).toHaveBeenCalledTimes(1)
  const rawArg = spy.mock.calls.at(0)?.at(0)
  expect(typeof rawArg).toBe("string")
  expect(rawArg).not.toContain("\n")
  return JSON.parse(rawArg as string) as StructuredApiLogPayload
}

describe("ApiLogger", () => {
  let logSpy: MockInstance
  let warnSpy: MockInstance
  let errorSpy: MockInstance

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(TEST_FIXTURES.timestamp))
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe("service and environment resolution", () => {
    describe("when explicit constructor options are provided", () => {
      let parsed: StructuredApiLogPayload

      beforeEach(() => {
        createTestLogger({
          service: "custom-service",
          environment: "staging",
        }).info("Booting worker")
        parsed = parseLoggedLine(logSpy)
      })

      it("outputs the configured service, environment, and default requestId", () => {
        expect(parsed).toEqual(
          buildExpectedPayload({
            level: "info",
            service: "custom-service",
            environment: "staging",
            message: "Booting worker",
          })
        )
      })
    })

    describe("when Vercel environment variables are set", () => {
      let parsed: StructuredApiLogPayload

      beforeEach(() => {
        vi.stubEnv("SERVICE_NAME", TEST_FIXTURES.service)
        vi.stubEnv("VERCEL_ENV", TEST_FIXTURES.environment)
        new ApiLogger().info("Server started")
        parsed = parseLoggedLine(logSpy)
      })

      it("resolves service and environment from environment variables", () => {
        expect(parsed).toEqual(
          buildExpectedPayload({
            level: "info",
            message: "Server started",
          })
        )
      })
    })

    describe("when all service and environment variables are unset", () => {
      let parsed: StructuredApiLogPayload

      beforeEach(() => {
        vi.stubEnv("SERVICE_NAME", "")
        vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "")
        vi.stubEnv("VERCEL_ENV", "")
        vi.stubEnv("NODE_ENV", "")
        new ApiLogger().warn("Fallback check")
        parsed = parseLoggedLine(warnSpy)
      })

      it("falls back to class defaults and writes to console.warn", () => {
        expect(parsed).toEqual(
          buildExpectedPayload({
            level: "warn",
            service: ApiLogger.DEFAULT_SERVICE,
            environment: ApiLogger.DEFAULT_ENVIRONMENT,
            message: "Fallback check",
          })
        )
      })
    })
  })

  describe("log level filtering and silencing", () => {
    describe("when minLevel is set to silent", () => {
      let result: StructuredApiLogPayload | null

      beforeEach(() => {
        const silentLogger = createTestLogger({ minLevel: "silent" })
        silentLogger.info("Hidden info")
        silentLogger.warn("Hidden warn")
        result = silentLogger.error("Hidden error")
      })

      it("suppresses all console output and returns null", () => {
        expect(result).toBeNull()
        expect(logSpy).not.toHaveBeenCalled()
        expect(warnSpy).not.toHaveBeenCalled()
        expect(errorSpy).not.toHaveBeenCalled()
      })
    })

    describe("when LOG_LEVEL environment variable is set to error", () => {
      let parsed: StructuredApiLogPayload

      beforeEach(() => {
        vi.stubEnv("LOG_LEVEL", "error")
        const envLogger = createTestLogger()
        envLogger.info("Suppressed info")
        envLogger.warn("Suppressed warn")
        envLogger.error("Emitted error")
        parsed = parseLoggedLine(errorSpy)
      })

      it("suppresses info and warn logs while allowing error logs", () => {
        expect(logSpy).not.toHaveBeenCalled()
        expect(warnSpy).not.toHaveBeenCalled()
        expect(parsed.level).toBe("error")
        expect(parsed.message).toBe("Emitted error")
      })
    })
  })
  describe("ApiLogger.requestFactory", () => {
    describe("when created from a request with x-vercel-id and default domain IDs", () => {
      let parsed: StructuredApiLogPayload

      beforeEach(() => {
        const request = new Request(TEST_FIXTURES.gamesUrl, {
          headers: { "x-vercel-id": TEST_FIXTURES.requestId },
        })
        const reqLogger = ApiLogger.requestFactory(request, {
          service: TEST_FIXTURES.service,
          environment: TEST_FIXTURES.environment,
          defaultContext: {
            id: { gameId: TEST_FIXTURES.gameId },
          },
        })
        reqLogger.info("Player joined", {
          id: {
            teamId: TEST_FIXTURES.teamId,
            playerId: TEST_FIXTURES.playerId,
          },
        })
        parsed = parseLoggedLine(logSpy)
      })

      it("attaches the extracted requestId and merges nested domain IDs", () => {
        expect(parsed).toEqual(
          buildExpectedPayload({
            level: "info",
            requestId: TEST_FIXTURES.requestId,
            message: "Player joined",
            id: {
              gameId: TEST_FIXTURES.gameId,
              teamId: TEST_FIXTURES.teamId,
              playerId: TEST_FIXTURES.playerId,
            },
          })
        )
      })
    })

    describe("when created from a request without request ID headers", () => {
      let parsed: StructuredApiLogPayload

      beforeEach(() => {
        const request = new Request(TEST_FIXTURES.gamesUrl)
        ApiLogger.requestFactory(request).info("Local request")
        parsed = parseLoggedLine(logSpy)
      })

      it("populates requestId with ApiLogger.MISSING_REQUEST_ID", () => {
        expect(parsed.requestId).toBe(ApiLogger.MISSING_REQUEST_ID)
      })
    })
  })

  describe("Redis error extraction and sensitive data sanitization", () => {
    let prodLogger: ApiLogger

    beforeEach(() => {
      prodLogger = createTestLogger()
    })

    describe("when logging an ioredis ReplyError with command metadata", () => {
      let parsed: StructuredApiLogPayload

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

        prodLogger.error("Redis Lua execution failed", { error: redisErr })
        parsed = parseLoggedLine(errorSpy)
      })

      it("extracts code and uppercased command name without leaking command args", () => {
        expect(parsed.error).toMatchObject({
          name: "ReplyError",
          message: "NOSCRIPT No matching script. Please use EVAL.",
          code: "NOSCRIPT",
          command: "EVALSHA",
        })
        expect(JSON.stringify(parsed)).not.toContain("super-secret-password")
      })
    })

    describe("when an error message or stack contains sensitive credentials", () => {
      let parsed: StructuredApiLogPayload

      beforeEach(() => {
        const cookieKey = `game_session_${TEST_FIXTURES.gameId}`
        const leakyErr = new Error(
          `Failed parsing {"name":"Trivia","password":"santa"} with cookie ${cookieKey}=signed.token`
        )
        leakyErr.stack = `Error: Failed at password=santa and ${cookieKey}=signed.token`

        prodLogger.error("Request failed", { error: leakyErr })
        parsed = parseLoggedLine(errorSpy)
      })

      it("redacts plaintext passwords and session cookies from error fields", () => {
        const cookieKey = `game_session_${TEST_FIXTURES.gameId}`
        expect(parsed.error?.message).toBe(
          `Failed parsing {"name":"Trivia","password":"[REDACTED]"} with cookie ${cookieKey}=[REDACTED]`
        )
        expect(parsed.error?.stack).toBe(
          `Error: Failed at password=[REDACTED] and ${cookieKey}=[REDACTED]`
        )
      })
    })

    describe("when logging a circular object without a message property", () => {
      let parsed: StructuredApiLogPayload

      beforeEach(() => {
        const circular: Record<string, unknown> = { status: 503 }
        circular.self = circular

        prodLogger.error("Unhandled object failure", { error: circular })
        parsed = parseLoggedLine(errorSpy)
      })

      it("falls back to [Unserializable Object] inside serializeObject", () => {
        expect(parsed.error).toEqual({
          name: "UnknownError",
          message: "[Unserializable Object]",
        })
      })
    })

    describe("when JSON.stringify throws while serializing the log payload", () => {
      let parsed: StructuredApiLogPayload

      beforeEach(() => {
        vi.spyOn(JSON, "stringify").mockImplementationOnce(() => {
          throw new TypeError("Do not know how to serialize a BigInt")
        })

        prodLogger.error("Unhandled failure", {
          http: TEST_FIXTURES.http,
          error: new Error("Boom"),
        })
        parsed = parseLoggedLine(errorSpy)
      })

      it("falls back safely to LogSerializationError without throwing", () => {
        expect(parsed).toEqual(
          buildExpectedPayload({
            level: "error",
            message: "Unhandled failure",
            http: TEST_FIXTURES.http,
            error: {
              name: "LogSerializationError",
              message: "Failed to serialize log payload",
            },
          })
        )
      })
    })
  })

  describe("ApiLogger.extractRequestId", () => {
    describe("when both x-vercel-id and x-request-id headers are present", () => {
      let extracted: string

      beforeEach(() => {
        const headers = new Headers({
          "x-vercel-id": TEST_FIXTURES.requestId,
          "x-request-id": TEST_FIXTURES.fallbackRequestId,
        })
        extracted = ApiLogger.extractRequestId(headers)
      })

      it("prefers x-vercel-id", () => {
        expect(extracted).toBe(TEST_FIXTURES.requestId)
      })
    })

    describe("when only x-request-id header is present with multiple proxy IDs", () => {
      let extracted: string

      beforeEach(() => {
        extracted = ApiLogger.extractRequestId(
          new Headers({ "x-request-id": "  client-req-1, proxy-req-2  " })
        )
      })

      it("preserves the full raw trimmed header value", () => {
        expect(extracted).toBe("client-req-1, proxy-req-2")
      })
    })

    describe.each([
      ["empty Headers", new Headers()],
      ["blank x-vercel-id header", new Headers({ "x-vercel-id": "   " })],
      ["null headers", null],
      ["undefined headers", undefined],
    ])("when given %s", (_label, headers) => {
      let extracted: string

      beforeEach(() => {
        extracted = ApiLogger.extractRequestId(headers)
      })

      it("returns ApiLogger.MISSING_REQUEST_ID", () => {
        expect(extracted).toBe(ApiLogger.MISSING_REQUEST_ID)
      })
    })
  })
})
