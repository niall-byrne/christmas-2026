import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GameClientLogger } from "@/lib/game/client/logger"

describe("client logger", () => {
  let info: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => {})
    warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    error = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe.each([
    {
      level: "info",
      message: "Applied game state event",
      context: {
        component: "GameStateEvents",
        gameId: "game-1",
        revision: 4,
      },
    },
    {
      level: "warn",
      message: "Ignoring invalid SSE event",
      context: undefined,
    },
    {
      level: "error",
      message: "Snapshot request failed",
      context: undefined,
    },
  ] as const)("when logging at $level level", ({ level, message, context }) => {
    beforeEach(() => {
      new GameClientLogger({ enabled: true }).write(level, message, context)
    })

    it("writes a structured diagnostic to the matching console method", () => {
      const consoleSpy = { info, warn, error }[level]
      expect(consoleSpy).toHaveBeenCalledOnce()

      const payload = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(payload).toEqual({
        timestamp: expect.any(String),
        level,
        source: "game-client",
        component: context?.component ?? "GameClient",
        message,
        ...(context
          ? {
              context: {
                gameId: context.gameId,
                revision: context.revision,
              },
            }
          : {}),
      })

      for (const [otherLevel, otherSpy] of Object.entries({
        info,
        warn,
        error,
      })) {
        if (otherLevel !== level) {
          expect(otherSpy).not.toHaveBeenCalled()
        }
      }
    })
  })

  describe("when logging is disabled", () => {
    beforeEach(() => {
      const logger = new GameClientLogger({ enabled: false })
      logger.info("Applied game state event")
      logger.warn("Ignoring invalid SSE event")
      logger.error("Snapshot request failed")
    })

    it("does not write to the console", () => {
      expect(info).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    })
  })

  describe("when the threshold is silent", () => {
    beforeEach(() => {
      const logger = new GameClientLogger({
        enabled: true,
        minLevel: "silent",
      })
      logger.info("Applied game state event")
      logger.warn("Ignoring invalid SSE event")
      logger.error("Snapshot request failed")
    })

    it("suppresses all log levels", () => {
      expect(info).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    })
  })

  describe.each([
    {
      minLevel: "warn",
      shouldLogInfo: false,
      shouldLogWarn: true,
      shouldLogError: true,
    },
    {
      minLevel: "error",
      shouldLogInfo: false,
      shouldLogWarn: false,
      shouldLogError: true,
    },
  ] as const)(
    "when minLevel is $minLevel",
    ({ minLevel, shouldLogInfo, shouldLogWarn, shouldLogError }) => {
      beforeEach(() => {
        const logger = new GameClientLogger({ enabled: true, minLevel })
        logger.info("Info message")
        logger.warn("Warning message")
        logger.error("Error message")
      })

      it("filters each level against the configured threshold", () => {
        expect(info).toHaveBeenCalledTimes(shouldLogInfo ? 1 : 0)
        expect(warn).toHaveBeenCalledTimes(shouldLogWarn ? 1 : 0)
        expect(error).toHaveBeenCalledTimes(shouldLogError ? 1 : 0)
      })
    }
  )

  describe("when logging is configured by the environment", () => {
    describe("when development mode is active", () => {
      beforeEach(() => {
        vi.stubEnv("NODE_ENV", "development")
        vi.stubEnv("NEXT_PUBLIC_GAME_CLIENT_LOGGING", "")
        new GameClientLogger().info("Development diagnostic")
      })

      it("enables client logging by default", () => {
        expect(info).toHaveBeenCalledOnce()
      })
    })

    describe("when the public logging flag is false", () => {
      beforeEach(() => {
        vi.stubEnv("NODE_ENV", "development")
        vi.stubEnv("NEXT_PUBLIC_GAME_CLIENT_LOGGING", "false")
        new GameClientLogger().info("Disabled diagnostic")
      })

      it("disables client logging in development", () => {
        expect(info).not.toHaveBeenCalled()
      })
    })

    describe("when production mode is active", () => {
      beforeEach(() => {
        vi.stubEnv("NODE_ENV", "production")
        vi.stubEnv("NEXT_PUBLIC_GAME_CLIENT_LOGGING", "true")
        new GameClientLogger().error("Production diagnostic")
      })

      it("keeps client logging disabled", () => {
        expect(error).not.toHaveBeenCalled()
      })
    })
  })
})
