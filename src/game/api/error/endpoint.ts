import type { ApiErrorCode } from "@/contracts/game/api/data"
import { ERROR_MESSAGES } from "@/schemas/game/api"

export const API_ENDPOINT_INVARIANT_REASON = {
  GAME_ID_REQUIRED_FOR_PLAYER_AUTH: "GAME_ID_REQUIRED_FOR_PLAYER_AUTH",
  PLAYER_IDENTITY_MISSING: "PLAYER_IDENTITY_MISSING",
} as const

export type ApiEndpointInvariantReason =
  (typeof API_ENDPOINT_INVARIANT_REASON)[keyof typeof API_ENDPOINT_INVARIANT_REASON]

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

const API_ENDPOINT_INVARIANT_MESSAGES = {
  [API_ENDPOINT_INVARIANT_REASON.GAME_ID_REQUIRED_FOR_PLAYER_AUTH]:
    "A game ID is required for player authorization",
  [API_ENDPOINT_INVARIANT_REASON.PLAYER_IDENTITY_MISSING]:
    "Player authorization was not completed",
} satisfies Record<ApiEndpointInvariantReason, string>

export class ApiEndpointInvariantError extends Error {
  constructor(readonly reason: ApiEndpointInvariantReason) {
    super(API_ENDPOINT_INVARIANT_MESSAGES[reason])
    this.name = "ApiEndpointInvariantError"
    Object.setPrototypeOf(this, ApiEndpointInvariantError.prototype)
  }
}
