import type {
  GameClientEndpointLogger,
  GameClientLogContext,
  GameClientLoggerOptions,
  GameClientLogPayload,
} from "@/contracts/game/client/logger"
import {
  STRUCTURED_LOG_LEVEL_WEIGHT,
  type StructuredLogLevel,
  type StructuredLogThreshold,
} from "@/contracts/logger"

function isGameClientLoggingEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_GAME_CLIENT_LOGGING !== "false"
  )
}

export type {
  GameClientEndpointLogger,
  GameClientLogContext,
  GameClientLoggerOptions,
  GameClientLogPayload,
} from "@/contracts/game/client/logger"

export class GameClientLogger implements GameClientEndpointLogger {
  protected readonly enabled: boolean
  protected readonly minLevel: StructuredLogThreshold

  constructor(options: GameClientLoggerOptions = {}) {
    this.enabled = options.enabled ?? isGameClientLoggingEnabled()
    this.minLevel = options.minLevel ?? "info"
  }

  info(
    message: string,
    context?: GameClientLogContext
  ): GameClientLogPayload | null {
    return this.write("info", message, context)
  }

  warn(
    message: string,
    context?: GameClientLogContext
  ): GameClientLogPayload | null {
    return this.write("warn", message, context)
  }

  error(
    message: string,
    context?: GameClientLogContext
  ): GameClientLogPayload | null {
    return this.write("error", message, context)
  }

  write(
    level: StructuredLogLevel,
    message: string,
    context?: GameClientLogContext
  ): GameClientLogPayload | null {
    if (!this.shouldLog(level)) return null

    const { component = "GameClient", ...details } = context ?? {}
    const payload: GameClientLogPayload = {
      timestamp: new Date().toISOString(),
      level,
      source: "game-client",
      component,
      message,
      ...(Object.keys(details).length > 0 ? { context: details } : {}),
    }
    const line = JSON.stringify(payload)

    if (level === "error") {
      console.error(line)
    } else if (level === "warn") {
      console.warn(line)
    } else {
      console.info(line)
    }
    return payload
  }

  protected shouldLog(level: StructuredLogLevel) {
    return (
      this.enabled &&
      STRUCTURED_LOG_LEVEL_WEIGHT[level] >=
        STRUCTURED_LOG_LEVEL_WEIGHT[this.minLevel]
    )
  }
}

export const gameClientLogger = new GameClientLogger()
