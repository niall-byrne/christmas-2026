import { describe, expect, it } from "vitest"
import { gameStateChannel } from "@/game/api/redis/gameStateChannel"
import { RedisChannel } from "@/redis/shared/channel"
import { gameEventSchema } from "@/schemas/game/redis/gameStateEvent"

describe("gameStateChannel", () => {
  const TEST_FIXTURES = {
    gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
    createdAt: "2026-11-14T00:00:00.000Z",
  } as const

  const channel = gameStateChannel(TEST_FIXTURES.gameId)

  it("uses a game-specific event channel", () => {
    expect(channel).toBeInstanceOf(RedisChannel)
    expect(channel.name).toBe(`game:${TEST_FIXTURES.gameId}:events`)
  })

  it("accepts complete game state-change events", () => {
    expect(channel.schema).toBe(gameEventSchema)
    expect(
      channel.schema.safeParse({
        type: "game.state.changed",
        data: {
          gameId: TEST_FIXTURES.gameId,
          name: "Holiday Game",
          level: 0,
          revision: 1,
          createdAt: TEST_FIXTURES.createdAt,
          recipients: [],
          teams: [],
        },
      }).success
    ).toBe(true)
  })
})
