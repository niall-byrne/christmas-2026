import type { ApiErrorCode } from "@/contracts/game/api/data"
import { ERROR_MESSAGES } from "@/schemas/game/api"

export class ApiRouteError extends Error {
  readonly statusCode: number
  readonly error: ApiErrorCode
  readonly headers?: HeadersInit

  constructor(
    error: ApiErrorCode,
    statusCode = 400,
    message?: string,
    headers?: HeadersInit
  ) {
    super(message ?? ERROR_MESSAGES[error])
    this.name = "ApiRouteError"
    this.error = error
    this.statusCode = statusCode
    this.headers = headers
    Object.setPrototypeOf(this, ApiRouteError.prototype)
  }
}
