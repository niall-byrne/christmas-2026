import "server-only"
import {
  GAME_COMPLETE_LEVEL,
  type GetGameResponse,
} from "@/contracts/game/api/data/game"
import type { CardState } from "@/contracts/game/api/data/card"
import type { TeamState } from "@/contracts/game/api/data/team"
import { InvalidGameStateError } from "@/game/api/error/state"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { readGameSnapshotScript } from "@/game/api/redis/scripts/readGameSnapshot"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"
import { RedisClient } from "@/redis/api/client"
import { GetGameResponseSchema } from "@/schemas/game/api/game"

type GameHash = Record<string, string>
type SnapshotTeam = {
  teamId: string
  teamHash: GameHash
  players: { playerId: string; playerHash: GameHash }[]
}

export class GameState {
  protected readonly client: ReturnType<typeof RedisClient.getClient>

  constructor(protected readonly gameId: string) {
    this.client = RedisClient.getClient()
  }

  async read(): Promise<GetGameResponse | null> {
    const result: unknown = await this.client.eval(
      readGameSnapshotScript,
      3,
      redisKeys.game(this.gameId),
      redisKeys.cards(this.gameId),
      redisKeys.teams(this.gameId)
    )
    if (!Array.isArray(result) || result.length === 0) {
      throw new InvalidGameStateError("INVALID_REDIS_SNAPSHOT")
    }
    if (result[0] === GAME_SCRIPT_RESULT.NOT_FOUND) {
      return null
    }
    if (result[0] !== GAME_SCRIPT_RESULT.SUCCESS || result.length !== 4) {
      throw new InvalidGameStateError("INVALID_REDIS_SNAPSHOT")
    }

    const rootHash = this.parseHash(result[1])
    const cardsHash = this.parseHash(result[2])
    const teams = this.parseSnapshotTeams(result[3])
    const level = Number(rootHash.level ?? 0)
    const state: Record<string, unknown> = {
      gameId: this.gameId,
      name: rootHash.name ?? "",
      level,
      revision: Number(rootHash.revision ?? 0),
      createdAt: rootHash.created_at ?? new Date().toISOString(),
      recipients: this.getRecipients(cardsHash),
      teams: this.getTeams(teams),
    }

    if (level >= GAME_COMPLETE_LEVEL) {
      state.bonusCard = rootHash.bonus_card ?? ""
      state.cards = this.getCards(cardsHash)
    }

    return this.validate(state)
  }

  protected parseHash(value: unknown): GameHash {
    if (
      !Array.isArray(value) ||
      value.length % 2 !== 0 ||
      !value.every((item) => typeof item === "string")
    ) {
      throw new InvalidGameStateError("INVALID_REDIS_HASH")
    }

    const hash: GameHash = {}
    for (let index = 0; index < value.length; index += 2) {
      const key = value[index]
      const entryValue = value[index + 1]
      if (typeof key !== "string" || typeof entryValue !== "string") {
        throw new InvalidGameStateError("INVALID_REDIS_HASH")
      }
      hash[key] = entryValue
    }
    return hash
  }

  protected parseSnapshotTeams(value: unknown): SnapshotTeam[] {
    if (!Array.isArray(value)) {
      throw new InvalidGameStateError("INVALID_REDIS_TEAMS")
    }

    return value.map((row) => {
      if (
        !Array.isArray(row) ||
        row.length !== 3 ||
        typeof row[0] !== "string" ||
        !Array.isArray(row[2])
      ) {
        throw new InvalidGameStateError("INVALID_REDIS_TEAM")
      }

      return {
        teamId: row[0],
        teamHash: this.parseHash(row[1]),
        players: row[2].map((playerRow) => {
          if (
            !Array.isArray(playerRow) ||
            playerRow.length !== 2 ||
            typeof playerRow[0] !== "string"
          ) {
            throw new InvalidGameStateError("INVALID_REDIS_PLAYER")
          }
          return {
            playerId: playerRow[0],
            playerHash: this.parseHash(playerRow[1]),
          }
        }),
      }
    })
  }

  protected getRecipients(cardsHash: GameHash): string[] {
    return Object.values(cardsHash)
      .map((raw) => {
        try {
          const parsed = JSON.parse(raw)
          if (typeof parsed?.recipient === "string") {
            return parsed.recipient.trim()
          }
        } catch {
          // Ignore malformed cards while assembling the public recipient list.
        }
        return null
      })
      .filter((recipient): recipient is string => Boolean(recipient))
      .sort((left, right) => left.localeCompare(right))
  }

  protected getCards(cardsHash: GameHash): CardState[] {
    return Object.values(cardsHash)
      .map((raw) => {
        try {
          const parsed = JSON.parse(raw)
          if (!parsed || typeof parsed !== "object") {
            return null
          }
          return {
            recipient: String(parsed.recipient ?? "").trim(),
            identifier: String(parsed.identifier ?? "").trim(),
          }
        } catch {
          return null
        }
      })
      .filter(
        (card): card is CardState =>
          card !== null &&
          card.recipient.length > 0 &&
          card.identifier.length > 0
      )
      .sort((left, right) => left.recipient.localeCompare(right.recipient))
  }

  protected getTeams(teams: SnapshotTeam[]): TeamState[] {
    return teams
      .sort((left, right) => left.teamId.localeCompare(right.teamId))
      .map(({ teamId, teamHash, players }) => ({
        teamId,
        name: teamHash.name ?? "",
        color: (teamHash.color ?? "#000000").toLowerCase(),
        score: Number(teamHash.score ?? 0),
        players: players
          .sort((left, right) => left.playerId.localeCompare(right.playerId))
          .map(({ playerId, playerHash }) => ({
            playerId,
            name: playerHash.name ?? "",
            ready: String(playerHash.ready ?? "0") === "1",
          })),
      }))
  }

  protected validate(state: Record<string, unknown>): GetGameResponse {
    const parsed = GetGameResponseSchema.safeParse(state)
    if (!parsed.success) {
      throw new InvalidGameStateError(
        parsed.error.issues[0]?.message ?? "INVALID_GAME_DATA"
      )
    }
    return parsed.data
  }
}
