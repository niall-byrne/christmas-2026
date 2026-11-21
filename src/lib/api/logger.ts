import "server-only"
import type {
  ApiEndpointLogger,
  ApiLogContext,
  ApiLogErrorPayload,
  ApiLoggerOptionProps,
  StructuredApiLogPayload,
} from "@/contracts/api"
import {
  STRUCTURED_LOG_LEVEL_WEIGHT,
  type StructuredLogLevel,
  type StructuredLogThreshold,
} from "@/contracts/logger"
import { RedisErrorExtractor } from "@/lib/api/error/redis"

export class ApiLogger implements ApiEndpointLogger {
  static readonly MISSING_REQUEST_ID = "no-request-id"
  static readonly DEFAULT_SERVICE = "christmas-2026"
  static readonly DEFAULT_ENVIRONMENT = "development"

  protected static readonly SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
    [/("password"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"'],
    [/(\bpassword\s*=\s*)[^\s&;,]+/gi, "$1[REDACTED]"],
    [/(game_session_[a-z0-9]{24}\s*=\s*)[^\s;,]+/gi, "$1[REDACTED]"],
  ]

  protected readonly service?: string
  protected readonly environment?: string
  protected readonly minLevel?: StructuredLogThreshold
  protected readonly defaultContext: Omit<ApiLogContext, "error">

  constructor(options: ApiLoggerOptionProps = {}) {
    this.service = options.service
    this.environment = options.environment
    this.minLevel = options.minLevel
    this.defaultContext = options.defaultContext ?? {}
  }

  static extractRequestId(headers?: Headers | null): string {
    const vercelId = headers?.get("x-vercel-id")?.trim()
    if (vercelId) return vercelId

    const requestId = headers?.get("x-request-id")?.trim()
    if (requestId) return requestId

    return ApiLogger.MISSING_REQUEST_ID
  }

  static requestFactory(
    request: Pick<Request, "headers">,
    options: ApiLoggerOptionProps = {}
  ): ApiLogger {
    return new ApiLogger({
      ...options,
      defaultContext: {
        ...options.defaultContext,
        requestId: ApiLogger.extractRequestId(request.headers),
      },
    })
  }

  protected static isLoggerThreshold(
    value: string
  ): value is StructuredLogThreshold {
    return Object.hasOwn(STRUCTURED_LOG_LEVEL_WEIGHT, value)
  }

  protected static sanitizeText(value: string): string {
    return ApiLogger.SENSITIVE_PATTERNS.reduce(
      (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
      value
    )
  }

  protected shouldLog(level: StructuredLogLevel): boolean {
    const envLevel = process.env.LOG_LEVEL?.trim().toLowerCase() ?? ""
    const threshold =
      this.minLevel ??
      (ApiLogger.isLoggerThreshold(envLevel) ? envLevel : "info")

    return (
      STRUCTURED_LOG_LEVEL_WEIGHT[level] >=
      STRUCTURED_LOG_LEVEL_WEIGHT[threshold]
    )
  }

  protected serializeError(err: Error): ApiLogErrorPayload {
    const name = err.name || "Error"

    return {
      name,
      message: ApiLogger.sanitizeText(err.message || name),
      ...RedisErrorExtractor.extract(err),
      ...(err.stack ? { stack: ApiLogger.sanitizeText(err.stack) } : {}),
    }
  }

  protected serializeObject(obj: object): ApiLogErrorPayload {
    const candidate = obj as Record<string, unknown>
    const name =
      typeof candidate.name === "string" && candidate.name
        ? candidate.name
        : "UnknownError"

    let rawMessage: string
    if (candidate.message !== undefined && candidate.message !== "") {
      rawMessage = String(candidate.message)
    } else {
      try {
        rawMessage = JSON.stringify(obj)
      } catch {
        rawMessage = "[Unserializable Object]"
      }
    }

    return {
      name,
      message: ApiLogger.sanitizeText(rawMessage),
      ...RedisErrorExtractor.extract(obj),
      ...(typeof candidate.stack === "string"
        ? { stack: ApiLogger.sanitizeText(candidate.stack) }
        : {}),
    }
  }

  protected serialize(err: unknown): ApiLogErrorPayload | undefined {
    if (err === undefined || err === null) {
      return undefined
    }

    if (err instanceof Error) {
      return this.serializeError(err)
    }

    if (typeof err === "object") {
      return this.serializeObject(err)
    }

    return {
      name: "UnknownError",
      message: ApiLogger.sanitizeText(String(err)),
    }
  }

  protected buildBasePayload(
    level: StructuredLogLevel,
    message: string,
    context: ApiLogContext
  ): Omit<StructuredApiLogPayload, "error"> {
    const service =
      this.service?.trim() ||
      process.env.SERVICE_NAME?.trim() ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
      ApiLogger.DEFAULT_SERVICE

    const environment =
      this.environment?.trim() ||
      process.env.VERCEL_ENV?.trim() ||
      process.env.NODE_ENV?.trim() ||
      ApiLogger.DEFAULT_ENVIRONMENT

    const requestId =
      context.requestId?.trim() ||
      this.defaultContext.requestId?.trim() ||
      ApiLogger.MISSING_REQUEST_ID

    const mergedId =
      this.defaultContext.id || context.id
        ? { ...this.defaultContext.id, ...context.id }
        : undefined

    const http = context.http ?? this.defaultContext.http

    return {
      timestamp: new Date().toISOString(),
      level,
      service,
      environment,
      requestId,
      message: ApiLogger.sanitizeText(message),
      ...(http ? { http } : {}),
      ...(mergedId ? { id: mergedId } : {}),
    }
  }

  protected emit(level: StructuredLogLevel, line: string): void {
    if (level === "error") {
      console.error(line)
    } else if (level === "warn") {
      console.warn(line)
    } else {
      console.log(line)
    }
  }

  write(
    level: StructuredLogLevel,
    message: string,
    context: ApiLogContext = {}
  ): StructuredApiLogPayload | null {
    if (!this.shouldLog(level)) {
      return null
    }

    const basePayload = this.buildBasePayload(level, message, context)
    const serializedError = this.serialize(context.error)
    const payload: StructuredApiLogPayload = {
      ...basePayload,
      ...(serializedError ? { error: serializedError } : {}),
    }

    try {
      this.emit(level, JSON.stringify(payload))
      return payload
    } catch {
      const fallbackPayload: StructuredApiLogPayload = {
        ...basePayload,
        error: {
          name: "LogSerializationError",
          message: "Failed to serialize log payload",
        },
      }
      this.emit(level, JSON.stringify(fallbackPayload))
      return fallbackPayload
    }
  }

  info(
    message: string,
    context: ApiLogContext = {}
  ): StructuredApiLogPayload | null {
    return this.write("info", message, context)
  }

  warn(
    message: string,
    context: ApiLogContext = {}
  ): StructuredApiLogPayload | null {
    return this.write("warn", message, context)
  }

  error(
    message: string,
    context: ApiLogContext = {}
  ): StructuredApiLogPayload | null {
    return this.write("error", message, context)
  }
}
