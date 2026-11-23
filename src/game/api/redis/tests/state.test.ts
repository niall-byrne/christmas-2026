// @vitest-environment node

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
  GAME_COMPLETE_LEVEL,
  GAME_LOBBY_LEVEL,
} from "@/contracts/game/api/data/game"
import {
  INVALID_GAME_STATE_REASON,
  InvalidGameStateError,
} from "@/game/api/error/state"
import { GameState } from "@/game/api/redis/state"
import { RedisClient } from "@/redis/api/client"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

type RedisStateClient = Pick<ReturnType<typeof RedisClient.getClient>, "eval">

type RedisHash = Record<string, string>
type SnapshotPlayerFixture = { playerId: string; hash: RedisHash }
type SnapshotTeamFixture = {
  teamId: string
  hash: RedisHash
  players?: SnapshotPlayerFixture[]
}

function hashEntries(hash: RedisHash): string[] {
  return Object.entries(hash).flatMap(([key, value]) => [key, value])
}

function successSnapshot({
  game,
  cards = {},
  teams = [],
  unassignedPlayers = [],
}: {
  game: RedisHash
  cards?: RedisHash
  teams?: SnapshotTeamFixture[]
  unassignedPlayers?: SnapshotPlayerFixture[]
}) {
  return [
    GAME_SCRIPT_RESULT.SUCCESS,
    hashEntries(game),
    hashEntries(cards),
    teams.map(({ teamId, hash, players = [] }) => [
      teamId,
      hashEntries(hash),
      players.map(({ playerId, hash: playerHash }) => [
        playerId,
        hashEntries(playerHash),
      ]),
    ]),
    unassignedPlayers.map(({ playerId, hash }) => [
      playerId,
      hashEntries(hash),
    ]),
  ]
}

function mockRedisClient(snapshot: unknown = [GAME_SCRIPT_RESULT.NOT_FOUND]) {
  const client = {
    eval: vi.fn().mockResolvedValue(snapshot),
  } as unknown as RedisStateClient
  vi.spyOn(RedisClient, "getClient").mockReturnValue(
    client as unknown as ReturnType<typeof RedisClient.getClient>
  )
  return client
}

function readCompletedGameWithCards(gameId: string, cards: RedisHash) {
  mockRedisClient(
    successSnapshot({
      game: {
        level: String(GAME_COMPLETE_LEVEL),
        revision: "9",
        created_at: "2026-11-14T00:00:00.000Z",
        name: "Completed Game",
        bonus_card: "Ruby Crown",
      },
      cards,
    })
  )
  return new GameState(gameId).read()
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
  const gamePlayersKey = `${gameKey}:players`
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
          4,
          gameKey,
          cardsKey,
          teamsKey,
          gamePlayersKey
        )
      })
    })

    describe("when Redis data does not satisfy the game schema", () => {
      let state: Promise<Awaited<ReturnType<GameState["read"]>>>

      beforeEach(() => {
        mockRedisClient(
          successSnapshot({
            game: {
              level: "invalid",
              revision: "1",
              created_at: TEST_FIXTURES.createdAt,
              name: "Holiday Game",
            },
          })
        )
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
        mockRedisClient(
          successSnapshot({
            game: {
              level: String(GAME_LOBBY_LEVEL),
              created_at: TEST_FIXTURES.createdAt,
              name: "Holiday Game",
            },
          })
        )
        state = new GameState(TEST_FIXTURES.gameId).read()
      })

      it("throws InvalidGameStateError instead of accepting revision zero", async () => {
        await expect(state).rejects.toThrow(InvalidGameStateError)
      })
    })

    describe("when the game is active", () => {
      let state: Awaited<ReturnType<GameState["read"]>>

      beforeEach(async () => {
        mockRedisClient(
          successSnapshot({
            game: {
              level: String(GAME_LOBBY_LEVEL),
              revision: "7",
              created_at: TEST_FIXTURES.createdAt,
              name: "Holiday Game",
              password_hash: "secret-hash",
              bonus_card: "Hidden Crown",
            },
            cards: {
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
            teams: [
              {
                teamId: TEST_FIXTURES.teamIds.zulu,
                hash: {
                  name: "Zulu Team",
                  color: "#112233",
                  score: "12",
                },
                players: [
                  {
                    playerId: TEST_FIXTURES.playerIds.bob,
                    hash: { name: "Bob", ready: "0" },
                  },
                  {
                    playerId: TEST_FIXTURES.playerIds.alice,
                    hash: { name: "Alice", ready: "1" },
                  },
                ],
              },
              {
                teamId: TEST_FIXTURES.teamIds.alpha,
                hash: {
                  name: "Alpha Team",
                  color: "#AABBCC",
                  score: "3",
                },
              },
            ],
          })
        )
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
          unassignedPlayers: [],
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
        mockRedisClient(
          successSnapshot({
            game: {
              level: String(GAME_COMPLETE_LEVEL),
              revision: "9",
              created_at: TEST_FIXTURES.createdAt,
              name: "Completed Game",
              bonus_card: "Ruby Crown",
            },
            cards: {
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
          })
        )
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
          unassignedPlayers: [],
          teams: [],
          bonusCard: "Ruby Crown",
          cards: [
            { recipient: "Alice", identifier: "Gold Star" },
            { recipient: "Bob", identifier: "Silver Star" },
            { recipient: "Zoe", identifier: "Bronze Star" },
          ],
        })
      })

      describe("when a completed game's card JSON is malformed", () => {
        let state: Promise<Awaited<ReturnType<GameState["read"]>>>

        beforeEach(() => {
          state = readCompletedGameWithCards(TEST_FIXTURES.gameId, {
            alice: "{invalid-json",
          })
        })

        it("throws InvalidGameStateError instead of omitting the card", async () => {
          await expect(state).rejects.toBeInstanceOf(InvalidGameStateError)
          await expect(state).rejects.toThrow(
            INVALID_GAME_STATE_REASON.INVALID_REDIS_CARD
          )
        })
      })

      describe("when a completed game's card data is missing required fields", () => {
        let state: Promise<Awaited<ReturnType<GameState["read"]>>>

        beforeEach(() => {
          state = readCompletedGameWithCards(TEST_FIXTURES.gameId, {
            alice: JSON.stringify({ recipient: "Alice" }),
          })
        })

        it("throws InvalidGameStateError instead of omitting the card", async () => {
          await expect(state).rejects.toBeInstanceOf(InvalidGameStateError)
          await expect(state).rejects.toThrow(
            INVALID_GAME_STATE_REASON.INVALID_REDIS_CARD
          )
        })
      })
    })
  })
})
