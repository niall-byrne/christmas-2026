import type { AuthorizationErrorReason } from "@/contracts/game/api"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { ERROR_MESSAGES } from "@/schemas/game/api"

export class MissingAuthSecretError extends Error {
  readonly code: ApiErrorCode = ApiErrorCode.INTERNAL_SERVER_ERROR
  readonly reason = "MISSING_AUTH_SECRET" as const
  readonly statusCode = 500

  constructor(message = "AUTH_SECRET environment variable is not configured") {
    super(message)
    this.name = "MissingAuthSecretError"
    Object.setPrototypeOf(this, MissingAuthSecretError.prototype)
  }
}

export class AuthorizationError extends Error {
  readonly code: ApiErrorCode = ApiErrorCode.UNAUTHORIZED
  readonly statusCode = 401
  readonly reason: AuthorizationErrorReason

  constructor(
    reason: AuthorizationErrorReason,
    message = ERROR_MESSAGES[ApiErrorCode.UNAUTHORIZED]
  ) {
    super(message)
    this.name = "AuthorizationError"
    this.reason = reason
    Object.setPrototypeOf(this, AuthorizationError.prototype)
  }
}
