export type AuthorizationErrorReason =
  | "MISSING_COOKIE"
  | "MALFORMED_TOKEN"
  | "INVALID_SIGNATURE"
  | "GAME_ID_MISMATCH"

export interface AuthorizedSession {
  gameId: string
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
