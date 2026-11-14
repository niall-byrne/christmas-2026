import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { gameIds } from "@/lib/game/ids"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { redisLookupKey } from "@/lib/game/redisLookupKey"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { AddPlayerBodySchema } from "@/schemas/gameData/player"
import { z } from "zod"

const TeamPlayersParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
})

class AddPlayerEndpoint extends ApiEndpoint<
  typeof TeamPlayersParamsSchema,
  typeof AddPlayerBodySchema
> {
  protected override paramsSchema = TeamPlayersParamsSchema
  protected override bodySchema = AddPlayerBodySchema

  protected async execute({
    params,
    body,
  }: ApiEndpointInput<
    z.output<typeof TeamPlayersParamsSchema>,
    z.output<typeof AddPlayerBodySchema>
  >) {
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

    const normalizedName = redisLookupKey(body.name)
    const rawCard = await client.hget(cardsKey, normalizedName)
    if (!rawCard) {
      throw new ApiRouteError("RECIPIENT_NOT_FOUND", 422)
    }

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
    const playerId = gameIds.createEntityId()
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
  }
}

export const POST = new AddPlayerEndpoint().handle
