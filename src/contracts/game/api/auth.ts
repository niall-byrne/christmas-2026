export type AuthorizationErrorReason =
  | "GAME_ID_MISMATCH"
  | "INVALID_SIGNATURE"
  | "MALFORMED_TOKEN"
  | "MISSING_COOKIE"
  | "PLAYER_ID_MISMATCH"

export interface AuthorizedSession {
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

export interface AuthorizeRequestProps {
  request: Pick<Request, "headers">
  gameId?: string
  required?: boolean
  secret?: string
}
