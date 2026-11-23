import { z } from "zod"
import type {
  ApiEndpointContext,
  ApiEndpointInput,
  ApiEndpointResult,
} from "@/contracts/game/api"
import type { AuthorizedPlayerSession } from "@/contracts/game/api/auth"
import { AUTHORIZATION_ERROR_REASON } from "@/contracts/game/api/auth"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { AuthorizationError } from "@/game/api/error/auth"
import {
  API_ENDPOINT_INVARIANT_REASON,
  ApiEndpointInvariantError,
  ApiRouteError,
} from "@/game/api/error/endpoint"
import { Authorization } from "@/game/api/auth"
import { ApiLogger } from "@/game/api/logger"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { RedisClient } from "@/redis/api/client"
import { ERROR_MESSAGES } from "@/schemas/game/api"

export abstract class ApiEndpointBase<
  TParams extends z.ZodType = z.ZodType,
  TBody extends z.ZodType = z.ZodType,
  TData = unknown,
> {
  protected paramsSchema?: TParams
  protected bodySchema?: TBody
  protected requiresAnonymousSession = true
  protected requiresPlayerAuth = false

  private createErrorResponse(
    error: ApiErrorCode,
    statusCode: number,
    message = ERROR_MESSAGES[error],
    headers?: HeadersInit
  ): Response {
    return Response.json({ message, error }, { status: statusCode, headers })
  }

  private async parseBody(
    request: Request
  ): Promise<z.output<TBody> | undefined> {
    const schema = this.bodySchema
    if (!schema || ["GET", "HEAD"].includes(request.method)) {
      return undefined
    }

    const text = await request.text()
    if (!text.trim()) {
      return undefined
    }

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new ApiRouteError(ApiErrorCode.INVALID_JSON)
    }

    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      const code = parsed.error.issues[0]?.message as ApiErrorCode | undefined
      throw new ApiRouteError(code ?? ApiErrorCode.INVALID_JSON)
    }

    return parsed.data
  }

  private resolveRequestIds(params: unknown): Record<string, string> {
    if (!params || typeof params !== "object") {
      return {}
    }

    const record = params as Record<string, unknown>
    const ids: Record<string, string> = {}
    for (const key of ["gameId", "teamId", "playerId"]) {
      const value = record[key]
      if (typeof value === "string") {
        ids[key] = value
      }
    }
    return ids
  }

  private createJsonResponse(
    result: Exclude<ApiEndpointResult<TData>, Response>
  ): Response {
    return Response.json(result.data ?? null, {
      status: result.status ?? 200,
      headers: result.headers,
    })
  }

  private createResponse(
    result: ApiEndpointResult<TData>,
    playerIdentity: AuthorizedPlayerSession | undefined
  ): Response {
    const response =
      result instanceof Response
        ? result
        : this.createJsonResponse(
            result as Exclude<ApiEndpointResult<TData>, Response>
          )
    return this.refreshPlayerSession(response, playerIdentity)
  }

  private refreshPlayerSession(
    response: Response,
    playerIdentity: AuthorizedPlayerSession | undefined
  ): Response {
    if (
      !playerIdentity ||
      response.status >= 400 ||
      response.headers.has("Set-Cookie")
    ) {
      return response
    }

    const headers = new Headers(response.headers)
    headers.set(
      "Set-Cookie",
      Authorization.playerResponseHeaderFactory(
        playerIdentity.gameId,
        playerIdentity.playerId
      )
    )
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  protected abstract execute(
    input: ApiEndpointInput<z.output<TParams>, z.output<TBody>>
  ): Promise<ApiEndpointResult<TData>> | ApiEndpointResult<TData>

  readonly handle = async (
    request: Request,
    context: ApiEndpointContext<z.output<TParams>> = {}
  ): Promise<Response> => {
    const startedAt = Date.now()
    let requestIds: Record<string, string> = {}
    let logger = ApiLogger.requestFactory(request)

    try {
      const paramsValue = context.params
        ? await Promise.resolve(context.params)
        : {}
      requestIds = this.resolveRequestIds(paramsValue)
      logger = ApiLogger.requestFactory(request, {
        defaultContext: { id: requestIds },
      })

      const params = this.parseParams(paramsValue)
      this.authorizeAnonymousSession(request, paramsValue)
      const playerIdentity = await this.authorizePlayer(request, paramsValue)
      const body = await this.parseBody(request)
      const result = await this.execute({
        params,
        body: body as z.output<TBody>,
        request,
        logger,
        playerIdentity,
      })
      const response = this.createResponse(result, playerIdentity)

      logger.info(
        `${request.method} ${new URL(request.url).pathname} ${response.status}`,
        {
          http: this.getHttpContext(request, response.status, startedAt),
          id: requestIds,
        }
      )
      return response
    } catch (error) {
      return this.handleError(error, request, requestIds, logger, startedAt)
    }
  }

  private parseParams(params: unknown): z.output<TParams> {
    const schema = this.paramsSchema
    if (!schema) {
      return undefined as z.output<TParams>
    }

    const parsed = schema.safeParse(params)
    if (!parsed.success) {
      const code = parsed.error.issues[0]?.message as ApiErrorCode | undefined
      throw new ApiRouteError(code ?? ApiErrorCode.INVALID_GAME_ID)
    }
    return parsed.data
  }

  private authorizeAnonymousSession(request: Request, params: unknown): void {
    if (!this.requiresAnonymousSession) {
      return
    }

    const gameId =
      params && typeof params === "object" && "gameId" in params
        ? params.gameId
        : undefined
    Authorization.authorizeAnonymousRequest({
      request,
      gameId: typeof gameId === "string" ? gameId : undefined,
      required: true,
    })
  }

  private async authorizePlayer(
    request: Request,
    params: unknown
  ): Promise<AuthorizedPlayerSession | undefined> {
    if (!this.requiresPlayerAuth) {
      return undefined
    }

    const gameId =
      params && typeof params === "object" && "gameId" in params
        ? params.gameId
        : undefined
    if (typeof gameId !== "string") {
      throw new ApiEndpointInvariantError(
        API_ENDPOINT_INVARIANT_REASON.GAME_ID_REQUIRED_FOR_PLAYER_AUTH
      )
    }

    const identity = Authorization.authorizePlayerRequest(request, gameId)
    const client = RedisClient.getClient()
    const [playerExists, playerIsClaimed] = await Promise.all([
      client.exists(redisKeys.gamePlayer(gameId, identity.playerId)),
      client.sismember(redisKeys.players(gameId), identity.playerId),
    ])
    if (playerExists !== 1 || playerIsClaimed !== 1) {
      throw new AuthorizationError(
        AUTHORIZATION_ERROR_REASON.PLAYER_ID_MISMATCH
      )
    }
    return identity
  }

  protected requirePlayerIdentity(
    identity: AuthorizedPlayerSession | undefined
  ): AuthorizedPlayerSession {
    if (!identity) {
      throw new ApiEndpointInvariantError(
        API_ENDPOINT_INVARIANT_REASON.PLAYER_IDENTITY_MISSING
      )
    }
    return identity
  }

  private handleError(
    error: unknown,
    request: Request,
    requestIds: Record<string, string>,
    logger: ApiLogger,
    startedAt: number
  ): Response {
    if (error instanceof AuthorizationError) {
      logger.warn(`Unauthorized request: ${error.reason}`, {
        http: this.getHttpContext(request, 401, startedAt),
        id: requestIds,
        error,
      })
      return this.createErrorResponse(ApiErrorCode.UNAUTHORIZED, 401)
    }

    if (error instanceof ApiRouteError) {
      logger.warn(`${error.error}: ${error.message}`, {
        http: this.getHttpContext(request, error.statusCode, startedAt),
        id: requestIds,
        error,
      })
      return this.createErrorResponse(
        error.error,
        error.statusCode,
        error.message,
        error.headers
      )
    }

    const message =
      error instanceof Error ? error.message : "Unhandled API error"
    logger.error(message, {
      http: this.getHttpContext(request, 500, startedAt),
      id: requestIds,
      error,
    })
    return this.createErrorResponse(ApiErrorCode.INTERNAL_SERVER_ERROR, 500)
  }

  private getHttpContext(
    request: Request,
    statusCode: number,
    startedAt: number
  ) {
    return {
      method: request.method,
      path: new URL(request.url).pathname,
      statusCode,
      durationMs: Date.now() - startedAt,
    }
  }
}
