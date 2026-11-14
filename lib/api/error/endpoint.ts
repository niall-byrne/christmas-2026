import type { ApiErrorCode } from "@/contracts/gameData"
import { ERROR_MESSAGES } from "@/schemas/gameData"

export class ApiRouteError extends Error {
  readonly statusCode: number
  readonly error: ApiErrorCode

  constructor(error: ApiErrorCode, statusCode = 400, message?: string) {
    super(message ?? ERROR_MESSAGES[error])
    this.name = "ApiRouteError"
    this.error = error
    this.statusCode = statusCode
    Object.setPrototypeOf(this, ApiRouteError.prototype)
  }
}
