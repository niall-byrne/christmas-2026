import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { redisKeys } from "@/lib/game/redisKeys"
import { redisLookupKey } from "@/lib/game/redisLookupKey"
import { executeGameScript } from "@/lib/game/redisScripts/execute"
import { removePlayerScript } from "@/lib/game/redisScripts/removePlayer"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { z } from "zod"

const TeamPlayerParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
  playerId: z.string().regex(/^[a-z0-9]{24}$/),
})

class RemovePlayerEndpoint extends ApiEndpoint<typeof TeamPlayerParamsSchema> {
  protected override paramsSchema = TeamPlayerParamsSchema

  protected async execute({
    params,
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

    return {
      status: 200,
      data: {
        message: "Player removed",
      },
    }
  }
}

export const DELETE = new RemovePlayerEndpoint().handle
