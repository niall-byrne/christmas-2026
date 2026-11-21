import {
  type StructuredLogLevel,
  type StructuredLogThreshold,
  type StructuredLogger,
} from "@/contracts/shared/logger"
import type { RedisErrorMetadata } from "@/contracts/redis/error"

export interface ApiLogHttpContext {
  method: string
  path: string
  statusCode: number
  durationMs: number
}

export interface ApiLogIdContext {
  gameId?: string
  teamId?: string
  playerId?: string
}

export interface ApiLogErrorPayload extends RedisErrorMetadata {
  name: string
  message: string
  stack?: string
}

export interface StructuredApiLogPayload {
  timestamp: string
  level: StructuredLogLevel
  service: string
  environment: string
  requestId: string
  message: string
  http?: ApiLogHttpContext
  id?: ApiLogIdContext
  error?: ApiLogErrorPayload
}

export interface ApiLogContext {
  requestId?: string
  http?: ApiLogHttpContext
  id?: ApiLogIdContext
  error?: unknown
}

export type ApiEndpointLogger = StructuredLogger<
  ApiLogContext,
  StructuredApiLogPayload
>

export interface ApiLoggerOptionProps {
  service?: string
  environment?: string
  minLevel?: StructuredLogThreshold
  defaultContext?: Omit<ApiLogContext, "error">
}
