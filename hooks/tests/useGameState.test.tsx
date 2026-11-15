import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  GAME_LOBBY_LEVEL,
  type GetGameResponse,
} from "@/contracts/gameData/game"
import { gameClientState } from "@/lib/game/clientState"
import { useGameState } from "@/hooks/useGameState"

class MockEventSource {
  static instances: MockEventSource[] = []
  onopen: ((this: EventSource, event: Event) => void) | null = null
  onmessage: ((this: EventSource, event: MessageEvent) => void) | null = null
  onerror: ((this: EventSource, event: Event) => void) | null = null
  closed = false

  constructor(public readonly url: string | URL) {
    MockEventSource.instances.push(this)
  }

  close = vi.fn(() => {
    this.closed = true
  })

  emitOpen() {
    this.onopen?.call(this as unknown as EventSource, new Event("open"))
  }

  emitError() {
    this.onerror?.call(this as unknown as EventSource, new Event("error"))
  }

  emitMessage(data: string) {
    this.onmessage?.call(
      this as unknown as EventSource,
      { data } as MessageEvent
    )
  }
}

describe("useGameState", () => {
  const TEST_FIXTURES = {
    gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
    createdAt: "2026-11-14T00:00:00.000Z",
  } as const

  function snapshot(
    revision: number,
    name = `Game ${revision}`
  ): GetGameResponse {
    return {
      gameId: TEST_FIXTURES.gameId,
      name,
      level: GAME_LOBBY_LEVEL,
      revision,
      createdAt: TEST_FIXTURES.createdAt,
      recipients: [],
      teams: [],
    }
  }

  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal(
      "EventSource",
      MockEventSource as unknown as typeof EventSource
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(snapshot(1)))
    )
    gameClientState.clearSnapshot(TEST_FIXTURES.gameId)
  })

  afterEach(() => {
    cleanup()
    gameClientState.clearSnapshot(TEST_FIXTURES.gameId)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe("when the event stream opens", () => {
    let source: MockEventSource
    let getHookState: () => GetGameResponse | null

    beforeEach(() => {
      const hook = renderHook(() => useGameState(TEST_FIXTURES.gameId))
      getHookState = () => hook.result.current
      source = MockEventSource.instances[0]
    })

    it("fetches a snapshot only after the EventSource is open", async () => {
      expect(fetch).not.toHaveBeenCalled()
      act(() => source.emitOpen())
      await vi.waitFor(() => {
        expect(getHookState()).toEqual(snapshot(1))
      })
    })
  })

  describe("when the event stream reconnects", () => {
    let source: MockEventSource

    beforeEach(async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(Response.json(snapshot(2, "First connection")))
        .mockResolvedValueOnce(Response.json(snapshot(4, "Reconnected")))
      renderHook(() => useGameState(TEST_FIXTURES.gameId))
      source = MockEventSource.instances[0]
      act(() => source.emitOpen())
      await vi.waitFor(() => {
        expect(gameClientState.getSnapshot(TEST_FIXTURES.gameId)).toEqual(
          snapshot(2, "First connection")
        )
      })
    })

    it("fetches the latest snapshot after each successful connection", async () => {
      act(() => source.emitOpen())
      await vi.waitFor(() => {
        expect(gameClientState.getSnapshot(TEST_FIXTURES.gameId)).toEqual(
          snapshot(4, "Reconnected")
        )
      })
      expect(fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe("when a live game snapshot arrives before a fetch response", () => {
    let accepted: GetGameResponse

    beforeEach(async () => {
      let finishFetch: ((response: Response) => void) | undefined
      vi.mocked(fetch).mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            finishFetch = resolve
          })
      )
      renderHook(() => useGameState(TEST_FIXTURES.gameId))
      const source = MockEventSource.instances[0]

      act(() => source.emitOpen())
      accepted = snapshot(3, "Live revision")
      act(() => {
        source.emitMessage(
          JSON.stringify({
            type: "game.state.changed",
            data: accepted,
          })
        )
      })
      await act(async () => {
        finishFetch?.(Response.json(snapshot(2, "Delayed fetch")))
      })
    })

    it("retains the snapshot with the higher revision", () => {
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameId)).toEqual(
        accepted
      )
    })
  })

  describe("when the event stream receives malformed JSON", () => {
    let source: MockEventSource

    beforeEach(() => {
      renderHook(() => useGameState(TEST_FIXTURES.gameId))
      source = MockEventSource.instances[0]
      act(() => source.emitMessage("{"))
    })

    it("ignores malformed JSON", () => {
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameId)).toBeNull()
      expect(source.closed).toBe(false)
    })
  })

  describe("when the event stream receives an unsupported event type", () => {
    let source: MockEventSource

    beforeEach(() => {
      renderHook(() => useGameState(TEST_FIXTURES.gameId))
      source = MockEventSource.instances[0]
      act(() =>
        source.emitMessage(JSON.stringify({ type: "broadcast", data: {} }))
      )
    })

    it("ignores unsupported event types", () => {
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameId)).toBeNull()
      expect(source.closed).toBe(false)
    })
  })

  describe("when the event stream receives an invalid game snapshot", () => {
    let source: MockEventSource

    beforeEach(() => {
      renderHook(() => useGameState(TEST_FIXTURES.gameId))
      source = MockEventSource.instances[0]
      act(() =>
        source.emitMessage(
          JSON.stringify({
            type: "game.state.changed",
            data: { gameId: TEST_FIXTURES.gameId, revision: -1 },
          })
        )
      )
    })

    it("ignores invalid game snapshots", () => {
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameId)).toBeNull()
      expect(source.closed).toBe(false)
    })
  })

  describe("when the hook is unmounted", () => {
    let source: MockEventSource
    let unmount: () => void

    beforeEach(() => {
      const hook = renderHook(() => useGameState(TEST_FIXTURES.gameId))
      source = MockEventSource.instances[0]
      unmount = hook.unmount
      unmount()
    })

    it("closes its EventSource connection", () => {
      expect(source.close).toHaveBeenCalledOnce()
    })
  })

  describe("when the authenticated game request reports unauthorized", () => {
    let source: MockEventSource

    beforeEach(async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }))
      renderHook(() => useGameState(TEST_FIXTURES.gameId))
      source = MockEventSource.instances[0]
      act(() => source.emitError())
      await vi.waitFor(() => expect(source.close).toHaveBeenCalledOnce())
    })

    it("closes EventSource", () => {
      expect(source.closed).toBe(true)
    })
  })

  describe("when the game is no longer available", () => {
    let source: MockEventSource

    beforeEach(async () => {
      gameClientState.applySnapshot(snapshot(4, "Old game"))
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }))
      renderHook(() => useGameState(TEST_FIXTURES.gameId))
      source = MockEventSource.instances[0]
      act(() => source.emitError())
      await vi.waitFor(() => expect(source.close).toHaveBeenCalledOnce())
    })

    it("clears that game's accepted state", () => {
      expect(source.closed).toBe(true)
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameId)).toBeNull()
    })
  })

  describe("when the game request fails transiently", () => {
    let source: MockEventSource
    let accepted: GetGameResponse

    beforeEach(async () => {
      accepted = snapshot(4, "Accepted")
      gameClientState.applySnapshot(accepted)
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))
      renderHook(() => useGameState(TEST_FIXTURES.gameId))
      source = MockEventSource.instances[0]
      act(() => source.emitError())
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    })

    it("retains the last accepted snapshot after a transient request failure", () => {
      expect(source.closed).toBe(false)
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameId)).toEqual(
        accepted
      )
    })
  })
})
