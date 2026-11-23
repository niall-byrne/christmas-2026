import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { gameClientState } from "@/game/ui/state/clientState"
import {
  GAME_COMPLETE_LEVEL,
  GAME_LOBBY_LEVEL,
  type GetGameResponse,
} from "@/contracts/game/api/data/game"

describe("game client state", () => {
  const TEST_FIXTURES = {
    gameIds: {
      first: "a1b2c3d4e5f6g7h8i9j0k1l2",
      second: "b1c2d3e4f5g6h7i8j9k0l1m2",
    },
    createdAt: "2026-11-14T00:00:00.000Z",
  } as const

  function activeSnapshot(
    gameId: string = TEST_FIXTURES.gameIds.first,
    revision = 1,
    name = `Game revision ${revision}`
  ): GetGameResponse {
    return {
      gameId,
      name,
      level: GAME_LOBBY_LEVEL,
      revision,
      createdAt: TEST_FIXTURES.createdAt,
      recipients: [],
      teams: [],
      unassignedPlayers: [],
    }
  }

  beforeEach(() => {
    gameClientState.clearSnapshot(TEST_FIXTURES.gameIds.first)
    gameClientState.clearSnapshot(TEST_FIXTURES.gameIds.second)
  })

  afterEach(() => {
    gameClientState.clearSnapshot(TEST_FIXTURES.gameIds.first)
    gameClientState.clearSnapshot(TEST_FIXTURES.gameIds.second)
  })

  describe("when no snapshot is stored for a game", () => {
    let incoming: GetGameResponse

    beforeEach(() => {
      incoming = activeSnapshot()
      gameClientState.applySnapshot(incoming)
    })

    it("stores the first valid complete snapshot", () => {
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameIds.first)).toEqual(
        incoming
      )
    })
  })

  describe("when a newer snapshot is applied", () => {
    let newer: GetGameResponse

    beforeEach(() => {
      gameClientState.applySnapshot({
        ...activeSnapshot(),
        teams: [
          {
            teamId: "a9b8c7d6e5f4g3h2i1j0k9l8",
            name: "Old team",
            color: "#aabbcc",
            score: 1,
            players: [],
          },
        ],
      })
      newer = activeSnapshot(TEST_FIXTURES.gameIds.first, 2, "Current game")
      gameClientState.applySnapshot(newer)
    })

    it("replaces the entire stored snapshot", () => {
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameIds.first)).toEqual(
        newer
      )
    })
  })

  describe("when a stale or equal snapshot arrives after a newer snapshot", () => {
    let accepted: GetGameResponse

    beforeEach(() => {
      accepted = activeSnapshot(TEST_FIXTURES.gameIds.first, 4, "Newest")
      gameClientState.applySnapshot(accepted)
    })

    it("ignores a lower revision without changing visible state", () => {
      expect(
        gameClientState.applySnapshot(
          activeSnapshot(TEST_FIXTURES.gameIds.first, 3, "Old")
        )
      ).toBe(false)
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameIds.first)).toEqual(
        accepted
      )
    })

    it("ignores a different payload at the same revision", () => {
      expect(
        gameClientState.applySnapshot(
          activeSnapshot(TEST_FIXTURES.gameIds.first, 4, "Equal")
        )
      ).toBe(false)
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameIds.first)).toEqual(
        accepted
      )
    })
  })

  describe("when snapshots are received from fetches and live events", () => {
    let liveEventSnapshot: GetGameResponse

    beforeEach(() => {
      liveEventSnapshot = activeSnapshot(
        TEST_FIXTURES.gameIds.first,
        3,
        "Live event"
      )
      const delayedFetchSnapshot = activeSnapshot(
        TEST_FIXTURES.gameIds.first,
        2,
        "Delayed fetch"
      )

      gameClientState.applySnapshot(liveEventSnapshot)
      gameClientState.applySnapshot(delayedFetchSnapshot)
    })

    it("retains the snapshot with the highest revision", () => {
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameIds.first)).toEqual(
        liveEventSnapshot
      )
    })
  })

  describe("when state is stored for multiple games", () => {
    let firstGame: GetGameResponse
    let secondGame: GetGameResponse

    beforeEach(() => {
      firstGame = activeSnapshot(TEST_FIXTURES.gameIds.first, 8)
      secondGame = activeSnapshot(TEST_FIXTURES.gameIds.second, 2)
      gameClientState.applySnapshot(firstGame)
      gameClientState.applySnapshot(secondGame)
    })

    it("compares revisions independently for each game ID", () => {
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameIds.first)).toEqual(
        firstGame
      )
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameIds.second)).toEqual(
        secondGame
      )
    })
  })

  describe("when an invalid snapshot arrives", () => {
    let accepted: GetGameResponse

    beforeEach(() => {
      accepted = activeSnapshot(TEST_FIXTURES.gameIds.first, 2, "Valid")
      gameClientState.applySnapshot(accepted)
      gameClientState.applySnapshot({
        ...activeSnapshot(TEST_FIXTURES.gameIds.first, 3),
        revision: -1,
      })
    })

    it("retains the last accepted complete snapshot", () => {
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameIds.first)).toEqual(
        accepted
      )
    })
  })

  describe("when a delayed active snapshot arrives after completion", () => {
    let completed: GetGameResponse

    beforeEach(() => {
      completed = {
        ...activeSnapshot(TEST_FIXTURES.gameIds.first, 5, "Completed"),
        level: GAME_COMPLETE_LEVEL,
        bonusCard: "Secret bonus",
        cards: [{ recipient: "Alice", identifier: "Secret card" }],
      }
      gameClientState.applySnapshot(completed)
      gameClientState.applySnapshot(
        activeSnapshot(TEST_FIXTURES.gameIds.first, 4, "Delayed active")
      )
    })

    it("retains the completed snapshot", () => {
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameIds.first)).toEqual(
        completed
      )
    })
  })

  describe("when one game's state is cleared", () => {
    let secondGame: GetGameResponse

    beforeEach(() => {
      const firstGame = activeSnapshot(TEST_FIXTURES.gameIds.first)
      secondGame = activeSnapshot(TEST_FIXTURES.gameIds.second)
      gameClientState.applySnapshot(firstGame)
      gameClientState.applySnapshot(secondGame)
      gameClientState.clearSnapshot(TEST_FIXTURES.gameIds.first)
    })

    it("preserves snapshots for other games", () => {
      expect(
        gameClientState.getSnapshot(TEST_FIXTURES.gameIds.first)
      ).toBeNull()
      expect(gameClientState.getSnapshot(TEST_FIXTURES.gameIds.second)).toEqual(
        secondGame
      )
    })
  })

  describe("when a subscribed listener receives a newer snapshot", () => {
    let listener: () => void
    let unsubscribe: () => void

    beforeEach(() => {
      gameClientState.applySnapshot(activeSnapshot())
      listener = vi.fn()
      unsubscribe = gameClientState.subscribe(
        TEST_FIXTURES.gameIds.first,
        listener
      )
    })

    afterEach(() => {
      unsubscribe()
    })

    it("notifies the listener when a newer snapshot is applied", () => {
      gameClientState.applySnapshot(
        activeSnapshot(TEST_FIXTURES.gameIds.first, 2)
      )

      expect(listener).toHaveBeenCalledOnce()
    })
  })

  describe("when a subscribed listener receives a stale snapshot", () => {
    let listener: () => void
    let unsubscribe: () => void

    beforeEach(() => {
      gameClientState.applySnapshot(activeSnapshot())
      listener = vi.fn()
      unsubscribe = gameClientState.subscribe(
        TEST_FIXTURES.gameIds.first,
        listener
      )
    })

    afterEach(() => {
      unsubscribe()
    })

    it("does not notify the listener when the stale snapshot is ignored", () => {
      gameClientState.applySnapshot(
        activeSnapshot(TEST_FIXTURES.gameIds.first, 1, "Stale")
      )

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe("when a subscribed game's snapshot is cleared", () => {
    let listener: () => void
    let unsubscribe: () => void

    beforeEach(() => {
      gameClientState.applySnapshot(activeSnapshot())
      listener = vi.fn()
      unsubscribe = gameClientState.subscribe(
        TEST_FIXTURES.gameIds.first,
        listener
      )
    })

    afterEach(() => {
      unsubscribe()
    })

    it("notifies the listener when the game's snapshot is cleared", () => {
      gameClientState.clearSnapshot(TEST_FIXTURES.gameIds.first)

      expect(listener).toHaveBeenCalledOnce()
      expect(
        gameClientState.getSnapshot(TEST_FIXTURES.gameIds.first)
      ).toBeNull()
    })
  })

  describe("when a listener unsubscribes", () => {
    let listener: () => void
    let unsubscribe: () => void

    beforeEach(() => {
      gameClientState.applySnapshot(activeSnapshot())
      listener = vi.fn()
      unsubscribe = gameClientState.subscribe(
        TEST_FIXTURES.gameIds.first,
        listener
      )
      unsubscribe()
    })

    it("does not notify the listener on later snapshot changes", () => {
      gameClientState.applySnapshot(
        activeSnapshot(TEST_FIXTURES.gameIds.first, 2)
      )

      expect(listener).not.toHaveBeenCalled()
    })
  })
})
