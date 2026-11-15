import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest"
import { GAME_STATE_CHANGED_EVENT_TYPE } from "@/schemas/redis/gameStateEvent"
import { GameClientLogger } from "@/lib/game/client/logger"
import { GameStateEvents } from "@/lib/game/client/subscription/gameStateEvents"

describe("GameStateEvents", () => {
  const TEST_FIXTURES = {
    gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
  } as const

  function message(data: string): MessageEvent {
    return { data } as MessageEvent
  }

  let applySnapshot: Mock<(snapshot: unknown) => void>
  let gameStateEvents: GameStateEvents
  let logger: GameClientLogger
  let warnSpy: Mock<typeof console.warn>

  beforeEach(() => {
    applySnapshot = vi.fn<(snapshot: unknown) => void>()
    logger = new GameClientLogger({ enabled: true })
    gameStateEvents = new GameStateEvents(
      TEST_FIXTURES.gameId,
      applySnapshot,
      logger
    )
    vi.spyOn(console, "info").mockImplementation(() => {})
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("when a valid event arrives for the subscribed game", () => {
    const snapshot = {
      gameId: TEST_FIXTURES.gameId,
      revision: 1,
      name: "Game",
      level: 0,
      createdAt: "2026-11-14T00:00:00.000Z",
      recipients: [],
      teams: [],
    }

    beforeEach(() => {
      gameStateEvents.handle(
        message(
          JSON.stringify({
            type: GAME_STATE_CHANGED_EVENT_TYPE,
            data: snapshot,
          })
        )
      )
    })

    it("applies the game snapshot", () => {
      expect(applySnapshot).toHaveBeenCalledWith(snapshot)
    })

    it("logs the applied revision", () => {
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('"revision":1')
      )
    })
  })

  describe("when the event contains malformed JSON", () => {
    const invalidPayload = '{"private":"player-data"'

    beforeEach(() => {
      gameStateEvents.handle(message(invalidPayload))
    })

    it("ignores the event without throwing", () => {
      expect(applySnapshot).not.toHaveBeenCalled()
    })

    it("logs safe parse diagnostics without payload content", () => {
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Ignoring malformed SSE JSON"')
      )
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(`"dataLength":${invalidPayload.length}`)
      )
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"errorName":"SyntaxError"')
      )
      expect(warnSpy.mock.calls[0][0]).not.toContain("player-data")
    })
  })

  describe("when the event type is unsupported", () => {
    beforeEach(() => {
      gameStateEvents.handle(
        message(JSON.stringify({ type: "broadcast", data: {} }))
      )
    })

    it("does not apply a snapshot", () => {
      expect(applySnapshot).not.toHaveBeenCalled()
    })

    it("logs the unsupported event type", () => {
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('"eventType":"broadcast"')
      )
    })
  })

  describe("when the event payload does not match the schema", () => {
    beforeEach(() => {
      gameStateEvents.handle(
        message(
          JSON.stringify({
            type: GAME_STATE_CHANGED_EVENT_TYPE,
            data: { gameId: TEST_FIXTURES.gameId, revision: -1 },
          })
        )
      )
    })

    it("does not apply an invalid snapshot", () => {
      expect(applySnapshot).not.toHaveBeenCalled()
    })

    it("logs the schema issues", () => {
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Ignoring invalid SSE event"')
      )
    })
  })

  describe("when the event is for another game", () => {
    beforeEach(() => {
      gameStateEvents.handle(
        message(
          JSON.stringify({
            type: GAME_STATE_CHANGED_EVENT_TYPE,
            data: {
              gameId: "b1b2c3d4e5f6g7h8i9j0k1l2",
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
    })

    it("does not apply that snapshot", () => {
      expect(applySnapshot).not.toHaveBeenCalled()
    })

    it("logs the event game id", () => {
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"eventGameId":"b1b2c3d4e5f6g7h8i9j0k1l2"')
      )
    })
  })
})
