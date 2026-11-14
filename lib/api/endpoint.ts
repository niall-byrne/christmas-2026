import { z } from "zod"
import type { ApiErrorCode } from "@/contracts/gameData"
import {
  AuthorizationError,
  MissingAuthSecretError,
} from "@/lib/api/error/auth"
import { Authorization } from "@/lib/api/auth"
import { ApiLogger } from "@/lib/api/logger"
import { ERROR_MESSAGE_MAP } from "@/schemas/gameData"

export type ApiEndpointResult<TData = unknown> =
  | {
      status?: number
      data?: TData
      headers?: HeadersInit
    }
  | Response

export interface ApiEndpointContext<Params = Record<string, unknown>> {
  params?: Params | Promise<Params>
}

export interface ApiEndpointOptions<
  TParams extends z.ZodTypeAny = z.ZodTypeAny,
  TBody extends z.ZodTypeAny = z.ZodTypeAny,
  TData = unknown,
> {
  paramsSchema?: TParams
  bodySchema?: TBody
  auth?: boolean
  handler: (input: {
    params: z.output<TParams>
    body: z.output<TBody>
    request: Request
    logger: ApiLogger
  }) => Promise<ApiEndpointResult<TData>> | ApiEndpointResult<TData>
}

export class ApiRouteError extends Error {
  readonly statusCode: number
  readonly error: ApiErrorCode

  constructor(error: ApiErrorCode, statusCode = 400, message?: string) {
    super(message ?? ERROR_MESSAGE_MAP.get(error) ?? "Request failed")
    this.name = "ApiRouteError"
    this.error = error
    this.statusCode = statusCode
    Object.setPrototypeOf(this, ApiRouteError.prototype)
  }
}

function buildErrorResponse(
  error: ApiErrorCode,
  statusCode: number,
  message = ERROR_MESSAGE_MAP.get(error) ?? "Request failed"
): Response {
  return Response.json(
    {
      message,
      error,
    },
    { status: statusCode }
  )
}

async function parseBody<TBody extends z.ZodTypeAny>(
  request: Request,
  bodySchema?: TBody
): Promise<z.output<TBody> | undefined> {
  if (!bodySchema || ["GET", "HEAD"].includes(request.method)) {
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
    throw new ApiRouteError("INVALID_JSON", 400)
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const code =
      (firstIssue?.message as ApiErrorCode | undefined) ?? "INVALID_JSON"
    throw new ApiRouteError(code, 400)
  }

  return parsed.data as z.output<TBody>
}

function resolveRequestId(
  params?: Record<string, unknown>
): Record<string, string> {
  const next: Record<string, string> = {}
  if (typeof params?.gameId === "string") next.gameId = params.gameId
  if (typeof params?.teamId === "string") next.teamId = params.teamId
  if (typeof params?.playerId === "string") next.playerId = params.playerId
  return next
}

export function createEndpoint<
  TParams extends z.ZodTypeAny = z.ZodTypeAny,
  TBody extends z.ZodTypeAny = z.ZodTypeAny,
  TData = unknown,
>(options: ApiEndpointOptions<TParams, TBody, TData>) {
  return async function endpoint(
    request: Request,
    context: ApiEndpointContext<z.output<TParams>> = {}
  ) {
    const startedAt = Date.now()
    const paramsValue = context.params
      ? await Promise.resolve(context.params)
      : {}
    const logger = ApiLogger.requestFactory(request, {
      defaultContext: {
        id: resolveRequestId(paramsValue as Record<string, unknown>),
      },
    })

    try {
      let params: z.output<TParams> = undefined as z.output<TParams>

      if (options.paramsSchema) {
        const parsed = options.paramsSchema.safeParse(paramsValue)
        if (!parsed.success) {
          const firstIssue = parsed.error.issues[0]
          const code =
            (firstIssue?.message as ApiErrorCode | undefined) ??
            "INVALID_GAME_ID"
          throw new ApiRouteError(code, 400)
        }
        params = parsed.data as z.output<TParams>
      }

      if (options.auth) {
        Authorization.authorizeRequest({
          request,
          gameId:
            typeof (paramsValue as Record<string, unknown>)?.gameId === "string"
              ? ((paramsValue as Record<string, unknown>).gameId as string)
              : undefined,
          required: true,
        })
      }

      const body = await parseBody(request, options.bodySchema)
      const result = await options.handler({
        params,
        body: body as z.output<TBody>,
        request,
        logger,
      })

      const response =
        result instanceof Response
          ? result
          : new Response(JSON.stringify(result?.data ?? null), {
              status: result?.status ?? 200,
              headers: result?.headers
                ? new Headers(result.headers)
                : undefined,
            })

      if (!(result instanceof Response)) {
        response.headers.set("Content-Type", "application/json; charset=utf-8")
      }

      logger.write(
        "info",
        `${request.method} ${new URL(request.url).pathname} ${response.status}`,
        {
          http: {
            method: request.method,
            path: new URL(request.url).pathname,
            statusCode: response.status,
            durationMs: Date.now() - startedAt,
          },
          id: resolveRequestId(paramsValue as Record<string, unknown>),
        }
      )

      return response
    } catch (error) {
      const statusCodeFromError =
        error instanceof ApiRouteError
          ? error.statusCode
          : error instanceof AuthorizationError
            ? 401
            : error instanceof MissingAuthSecretError
              ? 500
              : 500

      if (error instanceof AuthorizationError) {
        logger.write("warn", `Unauthorized request: ${error.reason}`, {
          http: {
            method: request.method,
            path: new URL(request.url).pathname,
            statusCode: 401,
            durationMs: Date.now() - startedAt,
          },
          error,
        })
        return buildErrorResponse("UNAUTHORIZED", 401)
      }

      if (error instanceof MissingAuthSecretError) {
        logger.write("error", error.message, {
          http: {
            method: request.method,
            path: new URL(request.url).pathname,
            statusCode: 500,
            durationMs: Date.now() - startedAt,
          },
          error,
        })
        return buildErrorResponse("INTERNAL_SERVER_ERROR", 500)
      }

      if (error instanceof ApiRouteError) {
        logger.write("warn", `${error.error}: ${error.message}`, {
          http: {
            method: request.method,
            path: new URL(request.url).pathname,
            statusCode: error.statusCode,
            durationMs: Date.now() - startedAt,
          },
          error,
        })
        return buildErrorResponse(error.error, error.statusCode, error.message)
      }

      if (
        error instanceof Error &&
        /JSON|Unexpected token|Unexpected end/i.test(error.message)
      ) {
        logger.write("warn", "Malformed JSON body", {
          http: {
            method: request.method,
            path: new URL(request.url).pathname,
            statusCode: 400,
            durationMs: Date.now() - startedAt,
          },
          error,
        })
        return buildErrorResponse("INVALID_JSON", 400)
      }

      logger.write(
        "error",
        error instanceof Error ? error.message : "Unhandled API error",
        {
          http: {
            method: request.method,
            path: new URL(request.url).pathname,
            statusCode: statusCodeFromError,
            durationMs: Date.now() - startedAt,
          },
          error,
        }
      )

      return buildErrorResponse("INTERNAL_SERVER_ERROR", 500)
    }
  }
}
