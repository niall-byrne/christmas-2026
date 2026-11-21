import {
  type StructuredLogLevel,
  type StructuredLogThreshold,
  type StructuredLogger,
} from "@/contracts/shared/logger"

export type GameClientLogContext = Record<string, unknown> & {
  component?: string
}

export type GameClientLogPayload = {
  timestamp: string
  level: StructuredLogLevel
  source: "game-client"
  component: string
  message: string
  context?: Omit<GameClientLogContext, "component">
}

export type GameClientLoggerOptions = {
  enabled?: boolean
  minLevel?: StructuredLogThreshold
}

export type GameClientEndpointLogger = StructuredLogger<
  GameClientLogContext,
  GameClientLogPayload
>
