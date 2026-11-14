import "server-only"
import { z } from "zod"
import { GetGameResponseSchema } from "@/schemas/gameData/game"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import type { GetGameResponse } from "@/contracts/gameData/game"
import { redisLookupKey } from "@/lib/game/redisLookupKey"
import { GAME_COMPLETE_LEVEL } from "@/contracts/gameData/game"

export async function getGameSnapshot(
  gameId: string
): Promise<GetGameResponse | null> {
  const client = RedisClient.getClient()
  const rootKey = redisKeys.game(gameId)
  const rootHash = await client.hgetall(rootKey)

  if (!rootHash || Object.keys(rootHash).length === 0) {
    return null
  }

  const [teamIds, cardsHash] = await Promise.all([
    client.smembers(redisKeys.teams(gameId)),
    client.hgetall(redisKeys.cards(gameId)),
  ])

  const level = Number(rootHash.level ?? 0)
  const revision = Number(rootHash.revision ?? 0)
  const createdAt = rootHash.created_at ?? new Date().toISOString()
  const name = rootHash.name ?? ""

  const recipients = Object.values(cardsHash ?? {})
    .map((raw) => {
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed?.recipient === "string")
          return parsed.recipient.trim()
      } catch {
        // ignore malformed cards during snapshot assembly
      }
      return null
    })
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right))

  const teams = await Promise.all(
    [...teamIds]
      .sort((left, right) => left.localeCompare(right))
      .map(async (teamId) => {
        const teamKey = redisKeys.team(gameId, teamId)
        const teamHash = await client.hgetall(teamKey)
        const playerIds = await client.smembers(
          redisKeys.teamPlayers(gameId, teamId)
        )

        const players = await Promise.all(
          [...playerIds]
            .sort((left, right) => left.localeCompare(right))
            .map(async (playerId) => {
              const playerKey = redisKeys.player(gameId, teamId, playerId)
              const playerHash = await client.hgetall(playerKey)
              return {
                playerId,
                name: playerHash.name ?? "",
                ready: String(playerHash.ready ?? "0") === "1",
              }
            })
        )

        return {
          teamId,
          name: teamHash.name ?? "",
          color: (teamHash.color ?? "#000000").toLowerCase(),
          score: Number(teamHash.score ?? 0),
          players,
        }
      })
  )

  const snapshot: Record<string, unknown> = {
    gameId,
    name,
    level,
    revision,
    createdAt,
    recipients,
    teams,
  }

  if (level >= GAME_COMPLETE_LEVEL) {
    const cards = Object.entries(cardsHash ?? {})
      .map(([lookupKey, raw]) => {
        try {
          const parsed = JSON.parse(raw)
          if (!parsed || typeof parsed !== "object") return null
          return {
            recipient: String(parsed.recipient ?? "").trim(),
            identifier: String(parsed.identifier ?? "").trim(),
          }
        } catch {
          return null
        }
      })
      .filter(
        (value): value is { recipient: string; identifier: string } =>
          value !== null &&
          value.recipient.length > 0 &&
          value.identifier.length > 0
      )
      .sort((left, right) => left.recipient.localeCompare(right.recipient))

    snapshot.bonusCard = rootHash.bonus_card ?? ""
    snapshot.cards = cards
  }

  if (level < GAME_COMPLETE_LEVEL) {
    delete snapshot.bonusCard
    delete snapshot.cards
  }

  const parsed = GetGameResponseSchema.safeParse(snapshot)
  if (!parsed.success) {
    throw new Error(
      `Game snapshot validation failed: ${parsed.error.issues[0]?.message ?? "INVALID_GAME_DATA"}`
    )
  }

  return parsed.data as GetGameResponse
}

export function normalizeCardRecipient(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function toCardLookupKey(value: string): string {
  return redisLookupKey(value)
}
