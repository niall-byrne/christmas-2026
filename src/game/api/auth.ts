import "server-only"
import type {
  AuthorizationHeaderOptionProps,
  AuthorizeAnonymousRequestProps,
  AuthorizedAnonymousSession,
  AuthorizedPlayerSession,
} from "@/contracts/game/api"
import { AUTHORIZATION_ERROR_REASON } from "@/contracts/game/api/auth"
import {
  AuthorizationError,
  MissingAuthSecretError,
} from "@/game/api/error/auth"
import { AuthCookie } from "@/game/api/authCookie"

export class Authorization {
  static readonly SESSION_PREFIX = "game_session_"
  static readonly PLAYER_SESSION_PREFIX = "game_player_"
  static readonly DEFAULT_MAX_AGE_SECONDS = 86_400
  static readonly PLAYER_MAX_AGE_SECONDS = 34_560_000

  static responseHeaderFactory(
    gameId: string,
    options: AuthorizationHeaderOptionProps = {}
  ): string {
    return AuthCookie.responseHeader(
      `${Authorization.SESSION_PREFIX}${gameId}`,
      { gameId },
      Authorization.DEFAULT_MAX_AGE_SECONDS,
      options,
      Authorization.getAuthSecret(options.secret)
    )
  }

  static playerResponseHeaderFactory(
    gameId: string,
    playerId: string,
    options: AuthorizationHeaderOptionProps = {}
  ): string {
    const payload: AuthorizedPlayerSession = { gameId, playerId }
    return AuthCookie.responseHeader(
      `${Authorization.PLAYER_SESSION_PREFIX}${gameId}`,
      payload,
      Authorization.PLAYER_MAX_AGE_SECONDS,
      options,
      Authorization.getAuthSecret(options.secret)
    )
  }

  static authorizePlayerRequest(
    request: Pick<Request, "headers">,
    gameId: string,
    secret?: string
  ): AuthorizedPlayerSession {
    const resolvedGameId = gameId.trim()
    if (!resolvedGameId) {
      throw new Error("gameId is required for player authorization")
    }

    const payload = Authorization.decodeCookiePayload(
      request,
      `${Authorization.PLAYER_SESSION_PREFIX}${resolvedGameId}`,
      secret
    )
    if (
      !Authorization.isRecord(payload) ||
      typeof payload.gameId !== "string" ||
      !payload.gameId ||
      typeof payload.playerId !== "string" ||
      !payload.playerId
    ) {
      throw new AuthorizationError(AUTHORIZATION_ERROR_REASON.MALFORMED_TOKEN)
    }
    if (payload.gameId !== resolvedGameId) {
      throw new AuthorizationError(AUTHORIZATION_ERROR_REASON.GAME_ID_MISMATCH)
    }

    return {
      gameId: payload.gameId,
      playerId: payload.playerId,
    }
  }

  static authorizeAnonymousRequest(
    input: AuthorizeAnonymousRequestProps
  ): AuthorizedAnonymousSession | undefined {
    if (!input.required) return undefined

    const gameId = input.gameId?.trim()
    if (!gameId) {
      throw new Error("gameId is required for anonymous session authorization")
    }

    const payload = Authorization.decodeCookiePayload(
      input.request,
      `${Authorization.SESSION_PREFIX}${gameId}`,
      input.secret
    )
    if (
      !Authorization.isRecord(payload) ||
      typeof payload.gameId !== "string" ||
      !payload.gameId
    ) {
      throw new AuthorizationError(AUTHORIZATION_ERROR_REASON.MALFORMED_TOKEN)
    }
    if (payload.gameId !== gameId) {
      throw new AuthorizationError(AUTHORIZATION_ERROR_REASON.GAME_ID_MISMATCH)
    }

    return { gameId: payload.gameId }
  }

  private static decodeCookiePayload(
    request: Pick<Request, "headers">,
    sessionName: string,
    secret?: string
  ): unknown {
    const resolvedSecret = Authorization.getAuthSecret(secret)
    const token = AuthCookie.readToken(request, sessionName)
    return AuthCookie.decodePayload(token, resolvedSecret)
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }

  private static getAuthSecret(secret?: string): string {
    const resolved = secret?.trim() || process.env.AUTH_SECRET?.trim()
    if (!resolved) {
      throw new MissingAuthSecretError()
    }
    return resolved
  }
}
