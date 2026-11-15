import { describe, expect, it, vi } from "vitest"
import { GAME_STATE_CHANGED_EVENT_TYPE } from "@/schemas/redis/gameStateEvent"
import { GameStateEvents } from "@/lib/game/client/subscription/gameStateEvents"

describe("GameStateEvents", () => {
  const TEST_FIXTURES = {
    gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
  } as const

  function message(data: string): MessageEvent {
    return { data } as MessageEvent
  }

  it("applies a valid event for the subscribed game", () => {
    const snapshot = {
      gameId: TEST_FIXTURES.gameId,
      revision: 1,
      name: "Game",
      level: 0,
      createdAt: "2026-11-14T00:00:00.000Z",
      recipients: [],
      teams: [],
    }
    const applySnapshot = vi.fn()
    const gameStateEvents = new GameStateEvents(
      TEST_FIXTURES.gameId,
      applySnapshot
    )

    gameStateEvents.handle(
      message(
        JSON.stringify({
          type: GAME_STATE_CHANGED_EVENT_TYPE,
          data: snapshot,
        })
      )
    )

    expect(applySnapshot).toHaveBeenCalledWith(snapshot)
  })

  it("ignores malformed JSON", () => {
    const applySnapshot = vi.fn()
    const gameStateEvents = new GameStateEvents(
      TEST_FIXTURES.gameId,
      applySnapshot
    )

    expect(() => gameStateEvents.handle(message("{"))).not.toThrow()
    expect(applySnapshot).not.toHaveBeenCalled()
  })

  it("ignores unsupported event types", () => {
    const applySnapshot = vi.fn()
    const gameStateEvents = new GameStateEvents(
      TEST_FIXTURES.gameId,
      applySnapshot
    )

    gameStateEvents.handle(
      message(JSON.stringify({ type: "broadcast", data: {} }))
    )

    expect(applySnapshot).not.toHaveBeenCalled()
  })

  it("ignores events for another game", () => {
    const applySnapshot = vi.fn()
    const gameStateEvents = new GameStateEvents(
      TEST_FIXTURES.gameId,
      applySnapshot
    )

    gameStateEvents.handle(
      message(
        JSON.stringify({
          type: GAME_STATE_CHANGED_EVENT_TYPE,
          data: {
            gameId: "another-game",
            revision: 1,
            name: "Game",
            level: 0,
            createdAt: "2026-11-14T00:00:00.000Z",
            recipients: [],
            teams: [],
          },
        })
      )
    )

    expect(applySnapshot).not.toHaveBeenCalled()
  })
})
