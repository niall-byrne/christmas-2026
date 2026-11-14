import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { z } from "zod"

const TeamPlayerParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
  playerId: z.string().regex(/^[a-z0-9]{24}$/),
})

class RemovePlayerEndpoint extends ApiEndpoint<typeof TeamPlayerParamsSchema> {
  constructor() {
    super({ paramsSchema: TeamPlayerParamsSchema, auth: true })
  }

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

    if ((await client.exists(gameKey)) === 0) {
      throw new ApiRouteError("GAME_NOT_FOUND", 404)
    }

    if ((await client.exists(teamKey)) === 0) {
      throw new ApiRouteError("TEAM_NOT_FOUND", 404)
    }

    const playerHash = await client.hgetall(playerKey)
    if (Object.keys(playerHash).length === 0) {
      throw new ApiRouteError("PLAYER_NOT_FOUND", 404)
    }

    const entryName = playerHash.name ?? ""
    await client.srem(gamePlayersKey, params.playerId)
    await client.srem(teamPlayersKey, params.playerId)
    await client.srem(
      playerNamesKey,
      entryName.trim().replace(/\s+/g, " ").toLowerCase()
    )
    await client.del(playerKey)
    await client.hincrby(gameKey, "revision", 1)

    return {
      status: 200,
      data: {
        message: "Player removed",
      },
    }
  }
}

export const DELETE = new RemovePlayerEndpoint().handler
