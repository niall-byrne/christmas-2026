export type StructuredLogLevel = "info" | "warn" | "error"
const SILENT_LOG_LEVEL = "silent" as const
export type StructuredLogThreshold =
  StructuredLogLevel | typeof SILENT_LOG_LEVEL
export const STRUCTURED_LOG_LEVEL_WEIGHT: Readonly<
  Record<StructuredLogThreshold, number>
> = Object.freeze({
  info: 0,
  warn: 1,
  error: 2,
  [SILENT_LOG_LEVEL]: 3,
})

export interface StructuredLogger<TContext, TPayload> {
  write(
    level: StructuredLogLevel,
    message: string,
    context?: TContext
  ): TPayload | null
  info(message: string, context?: TContext): TPayload | null
  warn(message: string, context?: TContext): TPayload | null
  error(message: string, context?: TContext): TPayload | null
}
