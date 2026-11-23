export const AUTHORIZATION_ERROR_REASON = {
  GAME_ID_MISMATCH: "GAME_ID_MISMATCH",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  MALFORMED_TOKEN: "MALFORMED_TOKEN",
  MISSING_COOKIE: "MISSING_COOKIE",
  PLAYER_ID_MISMATCH: "PLAYER_ID_MISMATCH",
} as const

export type AuthorizationErrorReason =
  (typeof AUTHORIZATION_ERROR_REASON)[keyof typeof AUTHORIZATION_ERROR_REASON]

export interface AuthorizedAnonymousSession {
  gameId: string
}

export interface AuthorizedPlayerSession {
  gameId: string
  playerId: string
}

export interface AuthorizationHeaderOptionProps {
  secret?: string
  maxAgeSeconds?: number
  secure?: boolean
}

export interface AuthorizeAnonymousRequestProps {
  request: Pick<Request, "headers">
  gameId?: string
  required?: boolean
  secret?: string
}
