import { z } from "zod"
import type {
  ApiEndpointContext,
  ApiEndpointInput,
  ApiEndpointResult,
} from "@/contracts/api"
import { ApiErrorCode } from "@/contracts/gameData"
import { AuthorizationError } from "@/lib/api/error/auth"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { Authorization } from "@/lib/api/auth"
import { ApiLogger } from "@/lib/api/logger"
import { ERROR_MESSAGES } from "@/schemas/gameData"

export abstract class ApiEndpoint<
  TParams extends z.ZodType = z.ZodType,
  TBody extends z.ZodType = z.ZodType,
  TData = unknown,
> {
  protected paramsSchema?: TParams
  protected bodySchema?: TBody
  protected requiresAuth = true

  private createErrorResponse(
    error: ApiErrorCode,
    statusCode: number,
    message = ERROR_MESSAGES[error]
  ): Response {
    return Response.json({ message, error }, { status: statusCode })
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
      this.authorize(request, paramsValue)
      const body = await this.parseBody(request)
      const result = await this.execute({
        params,
        body: body as z.output<TBody>,
        request,
        logger,
      })
      const response =
        result instanceof Response
          ? result
          : this.createJsonResponse(
              result as Exclude<ApiEndpointResult<TData>, Response>
            )

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

  private authorize(request: Request, params: unknown): void {
    if (!this.requiresAuth) {
      return
    }

    const gameId =
      params && typeof params === "object" && "gameId" in params
        ? params.gameId
        : undefined
    Authorization.authorizeRequest({
      request,
      gameId: typeof gameId === "string" ? gameId : undefined,
      required: true,
    })
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
        error.message
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
