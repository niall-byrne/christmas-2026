import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { ApiEndpointBase } from "@/game/api/endpoints/bases/apiEndpointBase"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { publishGameStateChanged } from "@/game/api/redis/publishState"
import { redisLookupKey } from "@/game/api/redis/redisLookupKey"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { removePlayerScript } from "@/game/api/redis/scripts/removePlayer"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema } from "@/schemas/game/api/game"
import { z } from "zod"

const TeamPlayerParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
  playerId: z.string().regex(/^[a-z0-9]{24}$/),
})

class RemovePlayerEndpoint extends ApiEndpointBase<
  typeof TeamPlayerParamsSchema
> {
  protected override paramsSchema = TeamPlayerParamsSchema

  protected async execute({
    params,
    logger,
  }: ApiEndpointInput<z.output<typeof TeamPlayerParamsSchema>, unknown>) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)
    const playerKey = redisKeys.player(
      params.gameId,
      params.teamId,
      params.playerId
    )
    const gamePlayersKey = redisKeys.players(params.gameId)
    const teamPlayersKey = redisKeys.teamPlayers(params.gameId, params.teamId)
    const playerNamesKey = redisKeys.playerNames(params.gameId)
    const playerName = await client.hget(playerKey, "name")

    await executeGameScript(
      client,
      removePlayerScript,
      [
        gameKey,
        teamKey,
        teamPlayersKey,
        gamePlayersKey,
        playerNamesKey,
        playerKey,
      ],
      [params.playerId, redisLookupKey(playerName ?? "")]
    )

    await publishGameStateChanged(params.gameId, logger)

    return {
      status: 200,
      data: {
        message: "Player removed",
      },
    }
  }
}

export const DELETE = new RemovePlayerEndpoint().handle
