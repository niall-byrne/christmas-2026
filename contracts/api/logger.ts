export type ApiLogLevel = "info" | "warn" | "error"
export type ApiLoggerThreshold = ApiLogLevel | "silent"

export interface RedisErrorMetadata {
  code?: string
  command?: string
}

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

export interface ApiLogErrorPayload {
  name: string
  message: string
  code?: string
  command?: string
  stack?: string
}

export interface StructuredApiLogPayload {
  timestamp: string
  level: ApiLogLevel
  service: string
  environment: string
  requestId: string
  message: string
  http?: ApiLogHttpContext
  id?: ApiLogIdContext
  error?: ApiLogErrorPayload
}

export interface ApiEndpointLogger {
  write(
    level: ApiLogLevel,
    message: string,
    context?: ApiLogContext
  ): StructuredApiLogPayload | null
  info(message: string, context?: ApiLogContext): StructuredApiLogPayload | null
  warn(message: string, context?: ApiLogContext): StructuredApiLogPayload | null
  error(
    message: string,
    context?: ApiLogContext
  ): StructuredApiLogPayload | null
}

export interface ApiLogContext {
  requestId?: string
  http?: ApiLogHttpContext
  id?: ApiLogIdContext
  error?: unknown
}

export interface ApiLoggerOptionProps {
  service?: string
  environment?: string
  minLevel?: ApiLoggerThreshold
  defaultContext?: Omit<ApiLogContext, "error">
}
