// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type Redis from "ioredis"
import type { GetGameResponse } from "@/contracts/game/api/data/game"
import type { ApiEndpointLogger } from "@/contracts/game/api/logger"
import { GAME_COMPLETE_LEVEL } from "@/contracts/game/api/data/game"
import { GameMutationEndpointBase } from "@/game/api/endpoints/bases/gameMutationEndpointBase"
import {
  INVALID_GAME_STATE_REASON,
  InvalidGameStateError,
} from "@/game/api/error/state"
import { GameState } from "@/game/api/redis/state"
import { gameStateChannel } from "@/game/api/redis/gameStateChannel"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"
import { RedisClient } from "@/redis/api/client"
import { redisBroker } from "@/redis/api/broker"
import { GAME_STATE_CHANGED_EVENT_TYPE } from "@/schemas/game/redis/gameStateEvent"

class TestGameMutationEndpoint extends GameMutationEndpointBase {
  getDidMutate(result: Array<string | number>) {
    return this.didMutate(result)
  }

  publishState(result: Array<string | number>) {
    return this.publishMutationState(
      "test-game-id",
      {} as ApiEndpointLogger,
      result
    )
  }

  publishSnapshot(gameId: string, logger: ApiEndpointLogger) {
    return this.publishGameStateChanged(gameId, logger)
  }

  protected execute() {
    return { status: 200, data: {} }
  }
}

class NonMutatingGameMutationEndpoint extends TestGameMutationEndpoint {
  protected override didMutate() {
    return false
  }
}

describe("GameMutationEndpointBase", () => {
  const loggerWarn = vi.fn()
  const logger = { warn: loggerWarn } as unknown as ApiEndpointLogger

  const TEST_FIXTURES = {
    gameId: "test-game-id",
    noOpResult: [GAME_SCRIPT_RESULT.NO_OP] as Array<string | number>,
    mutationResult: [GAME_SCRIPT_RESULT.SUCCESS, "player-id"] as Array<
      string | number
    >,
    snapshot: {
      gameId: "test-game-id",
      name: "Test game",
      level: GAME_COMPLETE_LEVEL,
      revision: 1,
      createdAt: "2026-11-14T00:00:00.000Z",
      recipients: [],
      teams: [],
      unassignedPlayers: [],
      bonusCard: "Bonus",
      cards: [],
    } satisfies GetGameResponse,
  } as const

  beforeEach(() => {
    vi.spyOn(RedisClient, "getClient").mockReturnValue({} as unknown as Redis)
  })

  afterEach(() => {
    loggerWarn.mockClear()
    vi.restoreAllMocks()
  })

  describe("when didMutate receives a script result", () => {
    it("returns false for a no-op result", () => {
      expect(
        new TestGameMutationEndpoint().getDidMutate(TEST_FIXTURES.noOpResult)
      ).toBe(false)
    })

    it("returns true for a successful mutation result", () => {
      expect(
        new TestGameMutationEndpoint().getDidMutate(
          TEST_FIXTURES.mutationResult
        )
      ).toBe(true)
    })
  })

  describe("when publishing state after a script result", () => {
    it("skips publication for a no-op result", async () => {
      const readSpy = vi.spyOn(GameState.prototype, "read")
      const publishSpy = vi.spyOn(redisBroker, "publish")

      await new TestGameMutationEndpoint().publishState(
        TEST_FIXTURES.noOpResult
      )

      expect(readSpy).not.toHaveBeenCalled()
      expect(publishSpy).not.toHaveBeenCalled()
    })

    it("publishes state for a successful mutation result", async () => {
      vi.spyOn(GameState.prototype, "read").mockResolvedValue(
        TEST_FIXTURES.snapshot
      )
      const publishSpy = vi
        .spyOn(redisBroker, "publish")
        .mockResolvedValue({} as never)

      await new TestGameMutationEndpoint().publishState(
        TEST_FIXTURES.mutationResult
      )

      expect(publishSpy).toHaveBeenCalledWith(
        gameStateChannel(TEST_FIXTURES.gameId),
        {
          type: GAME_STATE_CHANGED_EVENT_TYPE,
          data: TEST_FIXTURES.snapshot,
        }
      )
    })

    it("uses the overridden mutation decision hook", async () => {
      const readSpy = vi.spyOn(GameState.prototype, "read")
      const publishSpy = vi.spyOn(redisBroker, "publish")

      await new NonMutatingGameMutationEndpoint().publishState(
        TEST_FIXTURES.mutationResult
      )

      expect(readSpy).not.toHaveBeenCalled()
      expect(publishSpy).not.toHaveBeenCalled()
    })
  })

  describe("when publishing the game snapshot", () => {
    it("logs publication errors without throwing", async () => {
      const error = new Error("Redis publish failed")
      vi.spyOn(GameState.prototype, "read").mockResolvedValue(
        TEST_FIXTURES.snapshot
      )
      vi.spyOn(redisBroker, "publish").mockRejectedValue(error)

      await expect(
        new TestGameMutationEndpoint().publishSnapshot(
          TEST_FIXTURES.gameId,
          logger
        )
      ).resolves.toBeUndefined()

      expect(loggerWarn).toHaveBeenCalledWith(
        "Game state event publication failed after commit",
        { id: { gameId: TEST_FIXTURES.gameId }, error }
      )
    })

    it("logs an invalid-state error when the committed game is missing", async () => {
      vi.spyOn(GameState.prototype, "read").mockResolvedValue(null)
      const publishSpy = vi.spyOn(redisBroker, "publish")

      await new TestGameMutationEndpoint().publishSnapshot(
        TEST_FIXTURES.gameId,
        logger
      )

      expect(publishSpy).not.toHaveBeenCalled()
      expect(loggerWarn).toHaveBeenCalledWith(
        "Game state event publication failed after commit",
        {
          id: { gameId: TEST_FIXTURES.gameId },
          error: expect.objectContaining({
            name: new InvalidGameStateError().name,
            message: `Game state validation failed: ${INVALID_GAME_STATE_REASON.COMMITTED_GAME_NOT_FOUND}`,
          }),
        }
      )
    })
  })
})
