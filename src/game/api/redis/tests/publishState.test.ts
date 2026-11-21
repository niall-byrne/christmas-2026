// @vitest-environment node

import type Redis from "ioredis"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiEndpointLogger } from "@/contracts/game/api/logger"
import {
  GAME_COMPLETE_LEVEL,
  type GetGameResponse,
} from "@/contracts/game/api/data/game"
import { GameState } from "@/game/api/redis/state"
import { publishGameStateChanged } from "@/game/api/redis/publishState"
import { RedisClient } from "@/redis/api/client"
import { redisBroker } from "@/redis/api/broker"

describe("publishGameStateChanged", () => {
  const gameId = "a1b2c3d4e5f6g7h8i9j0k1l2"
  const TEST_FIXTURES = {
    snapshot: {
      gameId,
      name: "Completed game",
      level: GAME_COMPLETE_LEVEL,
      revision: 3,
      createdAt: "2026-11-14T00:00:00.000Z",
      recipients: [],
      teams: [],
      bonusCard: "Secret bonus",
      cards: [{ recipient: "Alice", identifier: "Secret card" }],
    } satisfies GetGameResponse,
  }

  const logger = {
    warn: vi.fn(),
  } as unknown as ApiEndpointLogger

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(RedisClient, "getClient").mockReturnValue({} as unknown as Redis)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("when an authoritative snapshot is available", () => {
    let publishSpy: ReturnType<typeof vi.spyOn>

    beforeEach(async () => {
      vi.spyOn(GameState.prototype, "read").mockResolvedValue(
        TEST_FIXTURES.snapshot
      )
      publishSpy = vi
        .spyOn(redisBroker, "publish")
        .mockResolvedValue({} as never)

      await publishGameStateChanged(gameId, logger)
    })

    it("publishes the full validated snapshot on the game's channel", () => {
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `game:${gameId}:events`,
        }),
        {
          type: "game.state.changed",
          data: TEST_FIXTURES.snapshot,
        }
      )
      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe("when snapshot publication fails after a mutation", () => {
    let publicationError: Error

    beforeEach(async () => {
      publicationError = new Error("Redis publish failed")
      vi.spyOn(GameState.prototype, "read").mockResolvedValue(
        TEST_FIXTURES.snapshot
      )
      vi.spyOn(redisBroker, "publish").mockRejectedValue(publicationError)

      await expect(
        publishGameStateChanged(gameId, logger)
      ).resolves.toBeUndefined()
    })

    it("logs the failure without throwing to the committed request", () => {
      expect(logger.warn).toHaveBeenCalledWith(
        "Game state event publication failed after commit",
        {
          id: { gameId },
          error: publicationError,
        }
      )
    })
  })

  describe("when the committed game is missing from the snapshot read", () => {
    beforeEach(async () => {
      vi.spyOn(GameState.prototype, "read").mockResolvedValue(null)
      await publishGameStateChanged(gameId, logger)
    })

    it("logs the standardized invalid-game-state error", () => {
      expect(logger.warn).toHaveBeenCalledWith(
        "Game state event publication failed after commit",
        {
          id: { gameId },
          error: expect.objectContaining({
            name: "InvalidGameStateError",
            message: "Game state validation failed: COMMITTED_GAME_NOT_FOUND",
          }),
        }
      )
    })
  })
})
