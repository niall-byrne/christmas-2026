// @vitest-environment node

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
  GAME_COMPLETE_LEVEL,
  GAME_LOBBY_LEVEL,
} from "@/contracts/game/api/data/game"
import { InvalidGameStateError } from "@/game/api/error/state"
import { GameState } from "@/game/api/redis/state"
import { RedisClient } from "@/redis/api/client"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

type RedisStateClient = Pick<ReturnType<typeof RedisClient.getClient>, "eval">

interface RedisStateFixture {
  hashes?: Record<string, Record<string, string>>
  sets?: Record<string, string[]>
}

function createRedisStateClient({
  hashes = {},
  sets = {},
}: RedisStateFixture = {}): RedisStateClient {
  return {
    eval: vi.fn(
      async (
        _script: string,
        _numberOfKeys: number,
        gameKey: string,
        cardsKey: string,
        teamsKey: string
      ) => {
        const gameHash = hashes[gameKey] ?? {}
        if (Object.keys(gameHash).length === 0) {
          return [GAME_SCRIPT_RESULT.NOT_FOUND]
        }

        const toEntries = (hash: Record<string, string>) =>
          Object.entries(hash).flatMap(([key, value]) => [key, value])

        const teams = (sets[teamsKey] ?? []).map((teamId) => {
          const teamKey = `${gameKey}:team:${teamId}`
          const players = (sets[`${teamKey}:players`] ?? []).map((playerId) => [
            playerId,
            toEntries(hashes[`${teamKey}:player:${playerId}`] ?? {}),
          ])
          return [teamId, toEntries(hashes[teamKey] ?? {}), players]
        })

        return [
          GAME_SCRIPT_RESULT.SUCCESS,
          toEntries(gameHash),
          toEntries(hashes[cardsKey] ?? {}),
          teams,
        ]
      }
    ) as unknown as RedisStateClient["eval"],
  }
}

function mockRedisClient(fixture: RedisStateFixture = {}): RedisStateClient {
  const client = createRedisStateClient(fixture)
  vi.spyOn(RedisClient, "getClient").mockReturnValue(
    client as unknown as ReturnType<typeof RedisClient.getClient>
  )
  return client
}

describe("GameState", () => {
  const TEST_FIXTURES = {
    gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
    teamIds: {
      alpha: "a9b8c7d6e5f4g3h2i1j0k9l8",
      zulu: "z9y8x7w6v5u4t3s2r1q0p9o8",
    },
    playerIds: {
      alice: "a1b2c3d4e5f6g7h8i9j0k1l2",
      bob: "b1c2d3e4f5g6h7i8j9k0l1m2",
    },
    createdAt: "2026-11-14T00:00:00.000Z",
  } as const

  const gameKey = `game:${TEST_FIXTURES.gameId}`
  const cardsKey = `${gameKey}:cards`
  const teamsKey = `${gameKey}:teams`
  const alphaTeamKey = `${gameKey}:team:${TEST_FIXTURES.teamIds.alpha}`
  const zuluTeamKey = `${gameKey}:team:${TEST_FIXTURES.teamIds.zulu}`
  const zuluPlayersKey = `${zuluTeamKey}:players`
  const alicePlayerKey = `${zuluTeamKey}:player:${TEST_FIXTURES.playerIds.alice}`
  const bobPlayerKey = `${zuluTeamKey}:player:${TEST_FIXTURES.playerIds.bob}`

  beforeEach(() => {
    vi.stubGlobal("redisClient", undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe("when read is called", () => {
    describe("when the game root hash does not exist", () => {
      let state: Promise<Awaited<ReturnType<GameState["read"]>>>
      let client: RedisStateClient

      beforeEach(() => {
        client = mockRedisClient()
        state = new GameState(TEST_FIXTURES.gameId).read()
      })

      it("returns null from one atomic Redis snapshot read", async () => {
        await expect(state).resolves.toBeNull()
        expect(client.eval).toHaveBeenCalledExactlyOnceWith(
          expect.any(String),
          3,
          gameKey,
          cardsKey,
          teamsKey
        )
      })
    })

    describe("when Redis data does not satisfy the game schema", () => {
      let state: Promise<Awaited<ReturnType<GameState["read"]>>>

      beforeEach(() => {
        mockRedisClient({
          hashes: {
            [gameKey]: {
              level: "invalid",
              revision: "1",
              created_at: TEST_FIXTURES.createdAt,
              name: "Holiday Game",
            },
          },
        })
        state = new GameState(TEST_FIXTURES.gameId).read()
      })

      it("throws InvalidGameStateError with a validation message", async () => {
        await expect(state).rejects.toThrow(InvalidGameStateError)
        await expect(state).rejects.toThrow("Game state validation failed:")
      })
    })

    describe("when the game revision is missing", () => {
      let state: Promise<Awaited<ReturnType<GameState["read"]>>>

      beforeEach(() => {
        mockRedisClient({
          hashes: {
            [gameKey]: {
              level: String(GAME_LOBBY_LEVEL),
              created_at: TEST_FIXTURES.createdAt,
              name: "Holiday Game",
            },
          },
        })
        state = new GameState(TEST_FIXTURES.gameId).read()
      })

      it("throws InvalidGameStateError instead of accepting revision zero", async () => {
        await expect(state).rejects.toThrow(InvalidGameStateError)
      })
    })

    describe("when the game is active", () => {
      let state: Awaited<ReturnType<GameState["read"]>>

      beforeEach(async () => {
        mockRedisClient({
          hashes: {
            [gameKey]: {
              level: String(GAME_LOBBY_LEVEL),
              revision: "7",
              created_at: TEST_FIXTURES.createdAt,
              name: "Holiday Game",
              password_hash: "secret-hash",
              bonus_card: "Hidden Crown",
            },
            [cardsKey]: {
              zoe: JSON.stringify({
                recipient: " Zoe ",
                identifier: "Hidden Card",
              }),
              bob: JSON.stringify({
                recipient: "Bob",
                identifier: "Hidden Card",
              }),
              alice: JSON.stringify({
                recipient: "Alice",
                identifier: "Hidden Card",
              }),
            },
            [alphaTeamKey]: {
              name: "Alpha Team",
              color: "#AABBCC",
              score: "3",
            },
            [zuluTeamKey]: {
              name: "Zulu Team",
              color: "#112233",
              score: "12",
            },
            [alicePlayerKey]: { name: "Alice", ready: "1" },
            [bobPlayerKey]: { name: "Bob", ready: "0" },
          },
          sets: {
            [teamsKey]: [
              TEST_FIXTURES.teamIds.zulu,
              TEST_FIXTURES.teamIds.alpha,
            ],
            [zuluPlayersKey]: [
              TEST_FIXTURES.playerIds.bob,
              TEST_FIXTURES.playerIds.alice,
            ],
          },
        })
        state = await new GameState(TEST_FIXTURES.gameId).read()
      })

      it("returns the canonical active-game snapshot", () => {
        expect(state).toEqual({
          gameId: TEST_FIXTURES.gameId,
          name: "Holiday Game",
          level: GAME_LOBBY_LEVEL,
          revision: 7,
          createdAt: TEST_FIXTURES.createdAt,
          recipients: ["Alice", "Bob", "Zoe"],
          teams: [
            {
              teamId: TEST_FIXTURES.teamIds.alpha,
              name: "Alpha Team",
              color: "#aabbcc",
              score: 3,
              players: [],
            },
            {
              teamId: TEST_FIXTURES.teamIds.zulu,
              name: "Zulu Team",
              color: "#112233",
              score: 12,
              players: [
                {
                  playerId: TEST_FIXTURES.playerIds.alice,
                  name: "Alice",
                  ready: true,
                },
                {
                  playerId: TEST_FIXTURES.playerIds.bob,
                  name: "Bob",
                  ready: false,
                },
              ],
            },
          ],
        })
      })
    })

    describe("when the game is completed", () => {
      let state: Awaited<ReturnType<GameState["read"]>>

      beforeEach(async () => {
        mockRedisClient({
          hashes: {
            [gameKey]: {
              level: String(GAME_COMPLETE_LEVEL),
              revision: "9",
              created_at: TEST_FIXTURES.createdAt,
              name: "Completed Game",
              bonus_card: "Ruby Crown",
            },
            [cardsKey]: {
              zoe: JSON.stringify({
                recipient: "Zoe",
                identifier: "Bronze Star",
              }),
              alice: JSON.stringify({
                recipient: "Alice",
                identifier: "Gold Star",
              }),
              bob: JSON.stringify({
                recipient: "Bob",
                identifier: "Silver Star",
              }),
            },
          },
        })
        state = await new GameState(TEST_FIXTURES.gameId).read()
      })

      it("returns the complete snapshot for a completed game", () => {
        expect(state).toEqual({
          gameId: TEST_FIXTURES.gameId,
          name: "Completed Game",
          level: GAME_COMPLETE_LEVEL,
          revision: 9,
          createdAt: TEST_FIXTURES.createdAt,
          recipients: ["Alice", "Bob", "Zoe"],
          teams: [],
          bonusCard: "Ruby Crown",
          cards: [
            { recipient: "Alice", identifier: "Gold Star" },
            { recipient: "Bob", identifier: "Silver Star" },
            { recipient: "Zoe", identifier: "Bronze Star" },
          ],
        })
      })
    })
  })
})
