import "server-only"
import { createEndpoint, ApiRouteError } from "@/lib/api/endpoint"
import { createEntityId } from "@/lib/game/helpers"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { redisLookupKey } from "@/lib/game/redisLookupKey"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { AddPlayerBodySchema } from "@/schemas/gameData/player"
import { z } from "zod"

const TeamPlayersParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
})

export const POST = createEndpoint({
  paramsSchema: TeamPlayersParamsSchema,
  bodySchema: AddPlayerBodySchema,
  auth: true,
  handler: async ({ params, body }) => {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)
    const cardsKey = redisKeys.cards(params.gameId)
    const teamPlayersKey = redisKeys.teamPlayers(params.gameId, params.teamId)
    const playerNamesKey = redisKeys.playerNames(params.gameId)
    const playersKey = redisKeys.players(params.gameId)

    if ((await client.exists(gameKey)) === 0) {
      throw new ApiRouteError("GAME_NOT_FOUND", 404)
    }

    if ((await client.exists(teamKey)) === 0) {
      throw new ApiRouteError("TEAM_NOT_FOUND", 404)
    }

    const lookupKey = redisLookupKey(body.name)
    const rawCard = await client.hget(cardsKey, lookupKey)
    if (!rawCard) {
      throw new ApiRouteError("RECIPIENT_NOT_FOUND", 422)
    }

    const normalizedName = redisLookupKey(body.name)
    if ((await client.sismember(playerNamesKey, normalizedName)) === 1) {
      throw new ApiRouteError("NAME_NOT_AVAILABLE", 409)
    }

    if ((await client.scard(teamPlayersKey)) >= 2) {
      throw new ApiRouteError("TEAM_FULL", 422)
    }

    const parsedCard = JSON.parse(rawCard) as {
      recipient?: string
      identifier?: string
    }
    const playerId = createEntityId()
    const playerKey = redisKeys.player(params.gameId, params.teamId, playerId)

    await client.hset(playerKey, {
      name: parsedCard.recipient ?? body.name,
      ready: "0",
    })
    await client.sadd(teamPlayersKey, playerId)
    await client.sadd(playersKey, playerId)
    await client.sadd(playerNamesKey, normalizedName)
    await client.hincrby(gameKey, "revision", 1)

    return {
      status: 201,
      data: {
        playerId,
        name: parsedCard.recipient ?? body.name,
        ready: false,
      },
    }
  },
})
