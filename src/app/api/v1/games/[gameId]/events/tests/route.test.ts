// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { Authorization } from "@/game/api/auth"
import { GET } from "@/app/api/v1/games/[gameId]/events/route"
import { redisBroker } from "@/redis/api/broker"

describe("GET /api/v1/games/:gameId/events", () => {
  const TEST_FIXTURES = {
    gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
    otherGameId: "b1c2d3e4f5g6h7i8j9k0l1m2",
    authSecret: "game-events-test-secret",
  } as const

  let streamSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", TEST_FIXTURES.authSecret)
    vi.stubEnv("LOG_LEVEL", "silent")
    streamSpy = vi
      .spyOn(redisBroker, "createStreamResponse")
      .mockResolvedValue(new Response("stream", { status: 200 }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("rejects requests without the matching game session", async () => {
    const request = new NextRequest(
      `http://localhost/api/v1/games/${TEST_FIXTURES.gameId}/events`
    )
    const response = await GET(request, {
      params: Promise.resolve({ gameId: TEST_FIXTURES.gameId }),
    })

    expect(response.status).toBe(401)
    expect(streamSpy).not.toHaveBeenCalled()
  })

  it("subscribes an authorized session only to its game's channel", async () => {
    const cookie = Authorization.responseHeaderFactory(TEST_FIXTURES.gameId)
    const request = new NextRequest(
      `http://localhost/api/v1/games/${TEST_FIXTURES.gameId}/events`,
      { headers: { cookie } }
    )
    const response = await GET(request, {
      params: Promise.resolve({ gameId: TEST_FIXTURES.gameId }),
    })

    expect(response.status).toBe(200)
    expect(streamSpy).toHaveBeenCalledOnce()
    const [channel] = streamSpy.mock.calls[0]
    expect(channel.name).toBe(`game:${TEST_FIXTURES.gameId}:events`)
    expect(channel.name).not.toBe(`game:${TEST_FIXTURES.otherGameId}:events`)
  })
})
