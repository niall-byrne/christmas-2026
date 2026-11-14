import "server-only"
import {
  GAME_COMPLETE_LEVEL,
  type GetGameResponse,
} from "@/contracts/gameData/game"
import type { CardState } from "@/contracts/gameData/card"
import type { TeamState } from "@/contracts/gameData/team"
import { InvalidGameStateError } from "@/lib/game/error/state"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { GetGameResponseSchema } from "@/schemas/gameData/game"

type GameHash = Record<string, string>

export class GameState {
  protected readonly client: ReturnType<typeof RedisClient.getClient>

  constructor(protected readonly gameId: string) {
    this.client = RedisClient.getClient()
  }

  async read(): Promise<GetGameResponse | null> {
    const rootHash = await this.client.hgetall(redisKeys.game(this.gameId))
    if (Object.keys(rootHash).length === 0) {
      return null
    }

    const [teamIds, cardsHash] = await Promise.all([
      this.client.smembers(redisKeys.teams(this.gameId)),
      this.client.hgetall(redisKeys.cards(this.gameId)),
    ])
    const level = Number(rootHash.level ?? 0)
    const state: Record<string, unknown> = {
      gameId: this.gameId,
      name: rootHash.name ?? "",
      level,
      revision: Number(rootHash.revision ?? 0),
      createdAt: rootHash.created_at ?? new Date().toISOString(),
      recipients: this.getRecipients(cardsHash),
      teams: await this.getTeams(teamIds),
    }

    if (level >= GAME_COMPLETE_LEVEL) {
      state.bonusCard = rootHash.bonus_card ?? ""
      state.cards = this.getCards(cardsHash)
    }

    return this.validate(state)
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

  protected async getTeams(teamIds: string[]): Promise<TeamState[]> {
    return Promise.all(
      [...teamIds]
        .sort((left, right) => left.localeCompare(right))
        .map((teamId) => this.getTeam(teamId))
    )
  }

  protected async getTeam(teamId: string): Promise<TeamState> {
    const teamKey = redisKeys.team(this.gameId, teamId)
    const [teamHash, playerIds] = await Promise.all([
      this.client.hgetall(teamKey),
      this.client.smembers(redisKeys.teamPlayers(this.gameId, teamId)),
    ])

    return {
      teamId,
      name: teamHash.name ?? "",
      color: (teamHash.color ?? "#000000").toLowerCase(),
      score: Number(teamHash.score ?? 0),
      players: await this.getPlayers(teamId, playerIds),
    }
  }

  protected async getPlayers(
    teamId: string,
    playerIds: string[]
  ): Promise<TeamState["players"]> {
    return Promise.all(
      [...playerIds]
        .sort((left, right) => left.localeCompare(right))
        .map(async (playerId) => {
          const playerHash = await this.client.hgetall(
            redisKeys.player(this.gameId, teamId, playerId)
          )
          return {
            playerId,
            name: playerHash.name ?? "",
            ready: String(playerHash.ready ?? "0") === "1",
          }
        })
    )
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
