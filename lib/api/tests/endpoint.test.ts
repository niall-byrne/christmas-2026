// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ApiErrorCode } from "@/contracts/gameData"
import type {
  ApiEndpointContext,
  ApiEndpointInput,
  ApiEndpointResult,
} from "@/contracts/api/endpoint"
import { InvalidGameStateError } from "@/lib/game/error/state"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { Authorization } from "@/lib/api/auth"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { ApiLogger } from "@/lib/api/logger"

type TestEndpointOptions<
  TParams extends z.ZodType,
  TBody extends z.ZodType,
  TData,
> = {
  paramsSchema?: TParams
  bodySchema?: TBody
  requiresAuth?: boolean
  execute: (
    input: ApiEndpointInput<z.output<TParams>, z.output<TBody>>
  ) => Promise<ApiEndpointResult<TData>> | ApiEndpointResult<TData>
}

class TestApiEndpoint<
  TParams extends z.ZodType = z.ZodType,
  TBody extends z.ZodType = z.ZodType,
  TData = unknown,
> extends ApiEndpoint<TParams, TBody, TData> {
  protected override paramsSchema?: TParams
  protected override bodySchema?: TBody
  protected override requiresAuth: boolean

  private readonly testExecute: TestEndpointOptions<
    TParams,
    TBody,
    TData
  >["execute"]

  constructor(options: TestEndpointOptions<TParams, TBody, TData>) {
    super()
    this.paramsSchema = options.paramsSchema
    this.bodySchema = options.bodySchema
    this.requiresAuth = options.requiresAuth ?? true
    this.testExecute = options.execute
  }

  protected execute(
    input: ApiEndpointInput<z.output<TParams>, z.output<TBody>>
  ): Promise<ApiEndpointResult<TData>> | ApiEndpointResult<TData> {
    return this.testExecute(input)
  }
}

describe("ApiEndpoint", () => {
  const TEST_FIXTURES = {
    gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
    secret: "test-auth-secret",
    url: "http://localhost:3000/api/v1/games",
    expectedUnauthorized: {
      message: "Authentication required",
      error: ApiErrorCode.UNAUTHORIZED,
    },
    expectedInvalidJson: {
      message: "Invalid JSON body",
      error: ApiErrorCode.INVALID_JSON,
    },
    expectedInvalidName: {
      message: "Invalid name",
      error: ApiErrorCode.INVALID_GAME_NAME,
    },
    expectedInternalError: {
      message: "Internal server error",
      error: ApiErrorCode.INTERNAL_SERVER_ERROR,
    },
  } as const

  async function callHandle<
    TParams extends z.ZodType = z.ZodType,
    TBody extends z.ZodType = z.ZodType,
    TData = unknown,
  >(
    options: TestEndpointOptions<TParams, TBody, TData>,
    request: Request,
    context?: ApiEndpointContext<z.output<TParams>>
  ): Promise<Response> {
    return new TestApiEndpoint(options).handle(request, context)
  }

  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", TEST_FIXTURES.secret)
    vi.stubEnv("LOG_LEVEL", "silent")
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("when ApiEndpoint.handle is called with valid JSON and required authentication is present", () => {
    let response: Response

    beforeEach(async () => {
      response = await callHandle(
        {
          paramsSchema: z.object({ gameId: z.string() }),
          bodySchema: z.object({ name: z.string() }),
          execute: async ({ params, body }) => ({
            status: 200,
            data: { ok: true, gameId: params.gameId, name: body.name },
          }),
        },
        new Request(`${TEST_FIXTURES.url}/abc`, {
          method: "POST",
          headers: {
            cookie: Authorization.responseHeaderFactory(TEST_FIXTURES.gameId, {
              secret: TEST_FIXTURES.secret,
            }),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Demo" }),
        }),
        { params: { gameId: TEST_FIXTURES.gameId } }
      )
    })

    it("accepts the session cookie and returns the endpoint's JSON result", async () => {
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        ok: true,
        gameId: TEST_FIXTURES.gameId,
        name: "Demo",
      })
    })
  })

  describe("when ApiEndpoint.handle is called without requiring authentication or a session cookie", () => {
    let response: Response

    beforeEach(async () => {
      response = await callHandle(
        {
          requiresAuth: false,
          execute: async () => new Response("stream-data", { status: 202 }),
        },
        new Request(`${TEST_FIXTURES.url}/stream`)
      )
    })

    it("calls execute and passes its Response through without wrapping it", async () => {
      expect(response.status).toBe(202)
      await expect(response.text()).resolves.toBe("stream-data")
    })
  })

  describe("when ApiEndpoint.handle is called with required authentication but no session cookie", () => {
    let response: Response

    beforeEach(async () => {
      response = await callHandle(
        {
          execute: async () => ({ status: 200, data: { ok: true } }),
        },
        new Request(`${TEST_FIXTURES.url}/missing`),
        { params: { gameId: TEST_FIXTURES.gameId } }
      )
    })

    it("returns an unauthorized error response", async () => {
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual(
        TEST_FIXTURES.expectedUnauthorized
      )
    })
  })

  describe("when ApiEndpoint.handle is called with a session cookie but authentication is not required", () => {
    let response: Response

    beforeEach(async () => {
      response = await callHandle(
        {
          requiresAuth: false,
          execute: async () => ({ status: 200, data: { ok: true } }),
        },
        new Request(`${TEST_FIXTURES.url}/optional-auth`, {
          headers: {
            cookie: Authorization.responseHeaderFactory(TEST_FIXTURES.gameId, {
              secret: TEST_FIXTURES.secret,
            }),
          },
        })
      )
    })

    it("calls execute without requiring or rejecting the session cookie", async () => {
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true })
    })
  })

  describe("when ApiEndpoint.handle is called and the auth secret is missing", () => {
    let response: Response

    beforeEach(async () => {
      vi.stubEnv("AUTH_SECRET", "")
      response = await callHandle(
        {
          execute: async () => ({ status: 200, data: { ok: true } }),
        },
        new Request(`${TEST_FIXTURES.url}/missing`),
        { params: { gameId: TEST_FIXTURES.gameId } }
      )
    })

    it("returns an internal server error response", async () => {
      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual(
        TEST_FIXTURES.expectedInternalError
      )
    })
  })

  describe("when ApiEndpoint.handle is called with invalid route parameters", () => {
    let response: Response

    beforeEach(async () => {
      response = await callHandle(
        {
          paramsSchema: z.object({
            gameId: z.string().regex(/^[a-z0-9]{24}$/, {
              error: ApiErrorCode.INVALID_GAME_ID,
            }),
          }),
          requiresAuth: false,
          execute: async () => ({ status: 200, data: { ok: true } }),
        },
        new Request(TEST_FIXTURES.url),
        { params: { gameId: "invalid" } }
      )
    })

    it("returns an invalid game ID error response", async () => {
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        message: "Invalid game ID",
        error: ApiErrorCode.INVALID_GAME_ID,
      })
    })
  })

  describe("when ApiEndpoint.handle is called with malformed JSON", () => {
    let response: Response

    beforeEach(async () => {
      response = await callHandle(
        {
          bodySchema: z.object({ name: z.string() }),
          requiresAuth: false,
          execute: async () => ({ status: 200, data: { ok: true } }),
        },
        new Request(TEST_FIXTURES.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{ invalid json }",
        })
      )
    })

    it("returns an invalid JSON error response", async () => {
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual(
        TEST_FIXTURES.expectedInvalidJson
      )
    })
  })

  describe("when ApiEndpoint.handle is called with a body that fails schema validation", () => {
    let response: Response

    beforeEach(async () => {
      response = await callHandle(
        {
          bodySchema: z.object({
            name: z.string({ error: ApiErrorCode.INVALID_GAME_NAME }),
          }),
          requiresAuth: false,
          execute: async () => ({ status: 200, data: { ok: true } }),
        },
        new Request(TEST_FIXTURES.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nope: true }),
        })
      )
    })

    it("returns the schema issue as a domain error response", async () => {
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual(
        TEST_FIXTURES.expectedInvalidName
      )
    })
  })

  describe("when ApiEndpoint.handle calls execute and it throws an API route error", () => {
    let response: Response

    beforeEach(async () => {
      response = await callHandle(
        {
          requiresAuth: false,
          execute: async () => {
            throw new ApiRouteError(ApiErrorCode.GAME_NOT_FOUND, 404)
          },
        },
        new Request(`${TEST_FIXTURES.url}/missing`)
      )
    })

    it("returns the route error's status and message", async () => {
      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({
        message: "Game not found",
        error: ApiErrorCode.GAME_NOT_FOUND,
      })
    })
  })

  describe("when an API route error includes response headers", () => {
    let response: Response

    beforeEach(async () => {
      response = await callHandle(
        {
          requiresAuth: false,
          execute: async () => {
            throw new ApiRouteError(ApiErrorCode.RATE_LIMITED, 429, undefined, {
              "Retry-After": "900",
            })
          },
        },
        new Request(`${TEST_FIXTURES.url}/limited`)
      )
    })

    it("includes the retry delay in the error response", async () => {
      expect(response.status).toBe(429)
      expect(response.headers.get("Retry-After")).toBe("900")
      await expect(response.json()).resolves.toEqual({
        message: "Too many requests",
        error: ApiErrorCode.RATE_LIMITED,
      })
    })
  })

  describe("when ApiEndpoint.handle calls execute and it throws an unexpected error", () => {
    let response: Response
    let logSpy: ReturnType<typeof vi.spyOn>

    beforeEach(async () => {
      logSpy = vi
        .spyOn(ApiLogger.prototype, "write")
        .mockImplementation(() => ({}) as never)
      response = await callHandle(
        {
          requiresAuth: false,
          execute: async () => {
            throw new Error("boom")
          },
        },
        new Request(`${TEST_FIXTURES.url}/fail`)
      )
    })

    it("returns an internal server error response and logs the failure", async () => {
      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual(
        TEST_FIXTURES.expectedInternalError
      )
      expect(logSpy).toHaveBeenCalled()
    })
  })

  describe("when ApiEndpoint.handle catches an invalid game state", () => {
    let response: Response
    let logSpy: ReturnType<typeof vi.spyOn>
    let stateError: InvalidGameStateError

    beforeEach(async () => {
      vi.stubEnv("LOG_LEVEL", "error")
      vi.stubEnv("SERVICE_NAME", "test-service")
      stateError = new InvalidGameStateError("INVALID_GAME_DATA")
      logSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      response = await callHandle(
        {
          requiresAuth: false,
          paramsSchema: z.object({ gameId: z.string() }),
          execute: async () => {
            throw stateError
          },
        },
        new Request(`${TEST_FIXTURES.url}/invalid-state`, {
          headers: { "x-request-id": "invalid-state-request" },
        }),
        { params: { gameId: TEST_FIXTURES.gameId } }
      )
    })

    it("returns a generic internal server error without exposing validation details", async () => {
      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual(
        TEST_FIXTURES.expectedInternalError
      )
    })

    it("logs the state error with request, route, and game context", () => {
      expect(logSpy).toHaveBeenCalledTimes(1)
      const [logLine] = logSpy.mock.calls[0]
      const logPayload = JSON.parse(String(logLine))

      expect(logPayload).toMatchObject({
        level: "error",
        service: "test-service",
        requestId: "invalid-state-request",
        message: stateError.message,
        http: {
          method: "GET",
          path: new URL(`${TEST_FIXTURES.url}/invalid-state`).pathname,
          statusCode: 500,
        },
        id: { gameId: TEST_FIXTURES.gameId },
        error: {
          name: "InvalidGameStateError",
          message: stateError.message,
        },
      })
    })
  })

  describe("when ApiEndpoint.handle is called and an unexpected error mentions JSON", () => {
    let response: Response

    beforeEach(async () => {
      response = await callHandle(
        {
          requiresAuth: false,
          execute: async () => {
            throw new Error("JSON processing failed")
          },
        },
        new Request(`${TEST_FIXTURES.url}/fail`)
      )
    })

    it("returns an internal server error response", async () => {
      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual(
        TEST_FIXTURES.expectedInternalError
      )
    })
  })
})
