import type { AuthorizationErrorReason } from "@/contracts/api"
import type { ApiErrorCode } from "@/contracts/gameData"
import { ERROR_MESSAGE_MAP } from "@/schemas/gameData"

export class MissingAuthSecretError extends Error {
  readonly code: ApiErrorCode = "INTERNAL_SERVER_ERROR"
  readonly reason = "MISSING_AUTH_SECRET" as const
  readonly statusCode = 500

  constructor(message = "AUTH_SECRET environment variable is not configured") {
    super(message)
    this.name = "MissingAuthSecretError"
    Object.setPrototypeOf(this, MissingAuthSecretError.prototype)
  }
}

export class AuthorizationError extends Error {
  readonly code: ApiErrorCode = "UNAUTHORIZED"
  readonly statusCode = 401
  readonly reason: AuthorizationErrorReason

  constructor(
    reason: AuthorizationErrorReason,
    message = ERROR_MESSAGE_MAP.get("UNAUTHORIZED") ?? "Authentication required"
  ) {
    super(message)
    this.name = "AuthorizationError"
    this.reason = reason
    Object.setPrototypeOf(this, AuthorizationError.prototype)
  }
}
