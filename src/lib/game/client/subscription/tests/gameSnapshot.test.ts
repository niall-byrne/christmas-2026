import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest"
import { GameClientLogger } from "@/lib/game/client/logger"
import { GameSnapshot } from "@/lib/game/client/subscription/gameSnapshot"

describe("GameSnapshot", () => {
  const TEST_FIXTURES = {
    gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
    url: "/api/v1/games/a1b2c3d4e5f6g7h8i9j0k1l2",
  } as const

  let applySnapshot: Mock<(snapshot: unknown) => void>
  let onUnauthorized: Mock<() => void>
  let onNotFound: Mock<() => void>

  beforeEach(() => {
    applySnapshot = vi.fn()
    onUnauthorized = vi.fn()
    onNotFound = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("when a valid response arrives", () => {
    const snapshot = { gameId: TEST_FIXTURES.gameId, revision: 1 }
    let fetcher: Mock<typeof fetch>

    beforeEach(async () => {
      fetcher = vi.fn(async () => Response.json(snapshot))
      const gameSnapshot = new GameSnapshot(TEST_FIXTURES.gameId, {
        isActive: () => true,
        applySnapshot,
        onUnauthorized,
        onNotFound,
        fetcher,
      })
      await gameSnapshot.fetch()
    })

    it("fetches without caching", () => {
      expect(fetcher).toHaveBeenCalledWith(TEST_FIXTURES.url, {
        cache: "no-store",
      })
    })

    it("applies the matching game snapshot", () => {
      expect(applySnapshot).toHaveBeenCalledWith(snapshot)
    })
  })

  describe("when a response contains a different game", () => {
    beforeEach(async () => {
      const gameSnapshot = new GameSnapshot(TEST_FIXTURES.gameId, {
        isActive: () => true,
        applySnapshot,
        onUnauthorized,
        onNotFound,
        fetcher: vi.fn(async () =>
          Response.json({ gameId: "another-game", revision: 1 })
        ),
      })
      await gameSnapshot.fetch()
    })

    it("does not apply that snapshot", () => {
      expect(applySnapshot).not.toHaveBeenCalled()
    })
  })

  describe("when the response is unauthorized", () => {
    beforeEach(async () => {
      const gameSnapshot = new GameSnapshot(TEST_FIXTURES.gameId, {
        isActive: () => true,
        applySnapshot,
        onUnauthorized,
        onNotFound,
        fetcher: vi.fn(async () => new Response(null, { status: 401 })),
      })
      await gameSnapshot.fetch()
    })

    it("calls the unauthorized handler", () => {
      expect(onUnauthorized).toHaveBeenCalledOnce()
    })
  })

  describe("when the game is missing", () => {
    beforeEach(async () => {
      const gameSnapshot = new GameSnapshot(TEST_FIXTURES.gameId, {
        isActive: () => true,
        applySnapshot,
        onUnauthorized,
        onNotFound,
        fetcher: vi.fn(async () => new Response(null, { status: 404 })),
      })
      await gameSnapshot.fetch()
    })

    it("calls the not-found handler", () => {
      expect(onNotFound).toHaveBeenCalledOnce()
    })
  })

  describe("when the request rejects", () => {
    let logger: GameClientLogger

    beforeEach(async () => {
      logger = new GameClientLogger({ enabled: true })
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const gameSnapshot = new GameSnapshot(
        TEST_FIXTURES.gameId,
        {
          isActive: () => true,
          applySnapshot,
          onUnauthorized,
          onNotFound,
          fetcher: vi.fn(async () => {
            throw new Error("network unavailable")
          }),
        },
        logger
      )
      await gameSnapshot.fetch()
    })

    it("does not apply a snapshot", () => {
      expect(applySnapshot).not.toHaveBeenCalled()
    })

    it("does not call terminal response handlers", () => {
      expect(onUnauthorized).not.toHaveBeenCalled()
      expect(onNotFound).not.toHaveBeenCalled()
    })

    it("logs the snapshot request error", () => {
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"error":"network unavailable"')
      )
    })
  })

  describe("when the subscription becomes inactive during a request", () => {
    beforeEach(async () => {
      let resolveResponse: ((response: Response) => void) | undefined
      const gameSnapshot = new GameSnapshot(TEST_FIXTURES.gameId, {
        isActive: () => false,
        applySnapshot,
        onUnauthorized,
        onNotFound,
        fetcher: vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              resolveResponse = resolve
            })
        ),
      })

      const request = gameSnapshot.fetch()
      resolveResponse?.(
        Response.json({ gameId: TEST_FIXTURES.gameId, revision: 1 })
      )
      await request
    })

    it("does not apply the late snapshot", () => {
      expect(applySnapshot).not.toHaveBeenCalled()
    })
  })
})
