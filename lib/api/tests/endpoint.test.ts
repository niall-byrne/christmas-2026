// @vitest-environment node

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { z } from "zod"
import { Authorization } from "@/lib/api/auth"
import { createEndpoint } from "@/lib/api/endpoint"
import { ApiLogger } from "@/lib/api/logger"

const TEST_FIXTURES = {
  gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
  secret: "test-auth-secret",
} as const

describe("createEndpoint", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", TEST_FIXTURES.secret)
    vi.stubEnv("LOG_LEVEL", "silent")
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("executes a JSON response successfully", async () => {
    const endpoint = createEndpoint({
      paramsSchema: z.object({ gameId: z.string() }),
      bodySchema: z.object({ name: z.string() }),
      auth: true,
      handler: async ({ params, body }) => ({
        status: 200,
        data: { ok: true, gameId: params.gameId, name: body.name },
      }),
    })

    const request = new Request("http://localhost:3000/api/v1/games/abc", {
      method: "POST",
      headers: {
        cookie: Authorization.responseHeaderFactory(TEST_FIXTURES.gameId, {
          secret: TEST_FIXTURES.secret,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Demo" }),
    })

    const response = await endpoint(request, {
      params: { gameId: TEST_FIXTURES.gameId },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      gameId: TEST_FIXTURES.gameId,
      name: "Demo",
    })
  })

  it("allows raw Response handlers to pass through without wrapping", async () => {
    const endpoint = createEndpoint({
      handler: async () => new Response("stream-data", { status: 202 }),
    })

    const response = await endpoint(
      new Request("http://localhost:3000/api/v1/stream")
    )

    expect(response.status).toBe(202)
    expect(await response.text()).toBe("stream-data")
  })

  it("returns 401 when the session cookie is missing or invalid", async () => {
    const endpoint = createEndpoint({
      auth: true,
      handler: async () => ({ status: 200, data: { ok: true } }),
    })

    const badRequest = new Request("http://localhost:3000/api/v1/games/nope")
    const response = await endpoint(badRequest, {
      params: { gameId: TEST_FIXTURES.gameId },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      message: "Authentication required",
      error: "UNAUTHORIZED",
    })
  })

  it("returns 400 for malformed JSON and validation violations", async () => {
    const endpoint = createEndpoint({
      bodySchema: z.object({ name: z.string({ error: "INVALID_GAME_NAME" }) }),
      handler: async () => ({ status: 200, data: { ok: true } }),
    })

    const badJson = new Request("http://localhost:3000/api/v1/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json }",
    })

    const badBody = new Request("http://localhost:3000/api/v1/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nope: true }),
    })

    const malformed = await endpoint(badJson)
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({
      message: "Invalid JSON body",
      error: "INVALID_JSON",
    })

    const invalid = await endpoint(badBody)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({
      message: "Invalid name",
      error: "INVALID_GAME_NAME",
    })
  })

  it("returns 500 for unexpected errors and logs them", async () => {
    const logSpy = vi
      .spyOn(ApiLogger.prototype, "write")
      .mockImplementation(() => ({}) as never)
    const endpoint = createEndpoint({
      handler: async () => {
        throw new Error("boom")
      },
    })

    const response = await endpoint(
      new Request("http://localhost:3000/api/v1/fail")
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      message: "Internal server error",
      error: "INTERNAL_SERVER_ERROR",
    })
    expect(logSpy).toHaveBeenCalled()
  })
})
