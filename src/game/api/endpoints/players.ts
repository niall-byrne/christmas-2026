import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { ApiEndpointBase } from "@/game/api/endpoints/bases/apiEndpointBase"
import { gameIds } from "@/game/api/services/ids"
import { publishGameStateChanged } from "@/game/api/redis/publishState"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { redisLookupKey } from "@/game/api/redis/redisLookupKey"
import { addPlayerScript } from "@/game/api/redis/scripts/addPlayer"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema } from "@/schemas/game/api/game"
import { AddPlayerBodySchema } from "@/schemas/game/api/data/player"
import { z } from "zod"

const TeamPlayersParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
})

class AddPlayerEndpoint extends ApiEndpointBase<
  typeof TeamPlayersParamsSchema,
  typeof AddPlayerBodySchema
> {
  protected override paramsSchema = TeamPlayersParamsSchema
  protected override bodySchema = AddPlayerBodySchema

  protected async execute({
    params,
    body,
    logger,
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

    await publishGameStateChanged(params.gameId, logger)

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
