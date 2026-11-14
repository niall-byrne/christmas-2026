import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { gameIds } from "@/lib/game/ids"
import { redisKeys } from "@/lib/game/redisKeys"
import { redisLookupKey } from "@/lib/game/redisLookupKey"
import { addPlayerScript } from "@/lib/game/redisScripts/addPlayer"
import { executeGameScript } from "@/lib/game/redisScripts/execute"
import { RedisClient } from "@/lib/redis/client"
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

    const playerId = gameIds.createEntityId()
    const playerKey = redisKeys.player(params.gameId, params.teamId, playerId)

    const result = await executeGameScript(
      client,
      addPlayerScript,
      [
        gameKey,
        teamKey,
        teamPlayersKey,
        cardsKey,
        playerNamesKey,
        playersKey,
        playerKey,
      ],
      [redisLookupKey(body.name), playerId, body.name]
    )
    const [createdPlayerId, name, ready] = result

    if (
      createdPlayerId !== playerId ||
      typeof name !== "string" ||
      ready !== "0"
    ) {
      throw new Error("Add-player script returned an unexpected result")
    }

    return {
      status: 201,
      data: {
        playerId: createdPlayerId,
        name,
        ready: false,
      },
    }
  }
}

export const POST = new AddPlayerEndpoint().handle
