// @vitest-environment node

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
  GAME_COMPLETE_LEVEL,
  GAME_LOBBY_LEVEL,
} from "@/contracts/gameData/game"
import { getGameSnapshot } from "@/lib/game/snapshot"
import { RedisClient } from "@/lib/redis/client"

const TEST_FIXTURES = {
  gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
  teamId: "z9y8x7w6v5u4t3s2r1q0p9o8",
  playerId: "m1n2b3v4c5x6z7l8k9j0h1g2",
} as const

describe("getGameSnapshot", () => {
  beforeEach(() => {
    vi.stubGlobal("redisClient", undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("returns null when the game root hash does not exist", async () => {
    vi.spyOn(RedisClient, "getClient").mockReturnValue({
      hgetall: vi.fn().mockResolvedValue({}),
      smembers: vi.fn().mockResolvedValue([]),
    } as any)

    await expect(getGameSnapshot(TEST_FIXTURES.gameId)).resolves.toBeNull()
  })

  it("sorts teams, players, and recipients deterministically and omits secret data before completion", async () => {
    const teamHash = { name: "Blue Team", color: "#112233", score: "12" }
    const playerHash = { name: "Alice", ready: "1" }

    vi.spyOn(RedisClient, "getClient").mockReturnValue({
      hgetall: vi.fn(async (key: string) => {
        if (key === `game:${TEST_FIXTURES.gameId}`) {
          return {
            level: String(GAME_LOBBY_LEVEL),
            revision: "7",
            created_at: "2026-11-14T00:00:00.000Z",
            name: "Holiday Game",
            bonus_card: "Gold Crown",
          }
        }
        if (key === `game:${TEST_FIXTURES.gameId}:cards`) {
          return {
            alice: JSON.stringify({
              recipient: "Alice",
              identifier: "Gold Star",
            }),
          }
        }
        if (key === `game:${TEST_FIXTURES.gameId}:team:${TEST_FIXTURES.teamId}`)
          return teamHash
        if (
          key ===
          `game:${TEST_FIXTURES.gameId}:team:${TEST_FIXTURES.teamId}:player:${TEST_FIXTURES.playerId}`
        )
          return playerHash
        return {}
      }),
      smembers: vi.fn(async (key: string) => {
        if (key === `game:${TEST_FIXTURES.gameId}:teams`)
          return [TEST_FIXTURES.teamId]
        if (
          key ===
          `game:${TEST_FIXTURES.gameId}:team:${TEST_FIXTURES.teamId}:players`
        )
          return [TEST_FIXTURES.playerId]
        return []
      }),
    } as any)

    const snapshot = await getGameSnapshot(TEST_FIXTURES.gameId)

    expect(snapshot).not.toBeNull()
    expect(snapshot?.level).toBe(GAME_LOBBY_LEVEL)
    expect(snapshot?.revision).toBe(7)
    expect(snapshot).not.toHaveProperty("bonusCard")
    expect(snapshot).not.toHaveProperty("cards")
    expect(snapshot?.teams[0]?.players[0]?.ready).toBe(true)
    expect(snapshot?.teams[0]?.score).toBe(12)
  })

  it("includes bonusCard and cards when the game is complete", async () => {
    const cards = {
      alice: JSON.stringify({ recipient: "Alice", identifier: "Gold Star" }),
      bob: JSON.stringify({ recipient: "Bob", identifier: "Silver Star" }),
    }

    vi.spyOn(RedisClient, "getClient").mockReturnValue({
      hgetall: vi.fn(async (key: string) => {
        if (key === `game:${TEST_FIXTURES.gameId}`) {
          return {
            level: String(GAME_COMPLETE_LEVEL),
            revision: "9",
            created_at: "2026-11-14T00:00:00.000Z",
            name: "Completed Game",
            bonus_card: "Ruby Crown",
          }
        }
        if (key === `game:${TEST_FIXTURES.gameId}:cards`) {
          return {
            alice: JSON.stringify({
              recipient: "Alice",
              identifier: "Gold Star",
            }),
            bob: JSON.stringify({
              recipient: "Bob",
              identifier: "Silver Star",
            }),
          }
        }
        return {}
      }),
      smembers: vi.fn(async () => []),
    } as any)

    const snapshot = await getGameSnapshot(TEST_FIXTURES.gameId)

    expect(snapshot).not.toBeNull()
    expect(snapshot?.level).toBe(GAME_COMPLETE_LEVEL)
    expect(snapshot).toHaveProperty("bonusCard", "Ruby Crown")
    expect(snapshot).toHaveProperty("cards")
    expect(snapshot?.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipient: "Alice",
          identifier: "Gold Star",
        }),
      ])
    )
  })
})
