import "server-only"
import { createEndpoint, ApiRouteError } from "@/lib/api/endpoint"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { z } from "zod"

const ReadyParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
  playerId: z.string().regex(/^[a-z0-9]{24}$/),
})

export const POST = createEndpoint({
  paramsSchema: ReadyParamsSchema,
  auth: true,
  handler: async ({ params }) => {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)
    const playerKey = redisKeys.player(
      params.gameId,
      params.teamId,
      params.playerId
    )

    if ((await client.exists(gameKey)) === 0) {
      throw new ApiRouteError("GAME_NOT_FOUND", 404)
    }

    if ((await client.exists(teamKey)) === 0) {
      throw new ApiRouteError("TEAM_NOT_FOUND", 404)
    }

    if ((await client.exists(playerKey)) === 0) {
      throw new ApiRouteError("PLAYER_NOT_FOUND", 404)
    }

    await client.hset(playerKey, { ready: "1" })
    await client.hincrby(gameKey, "revision", 1)

    return {
      status: 200,
      data: {
        playerId: params.playerId,
        ready: true,
      },
    }
  },
})

export const DELETE = createEndpoint({
  paramsSchema: ReadyParamsSchema,
  auth: true,
  handler: async ({ params }) => {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)
    const playerKey = redisKeys.player(
      params.gameId,
      params.teamId,
      params.playerId
    )

    if ((await client.exists(gameKey)) === 0) {
      throw new ApiRouteError("GAME_NOT_FOUND", 404)
    }

    if ((await client.exists(teamKey)) === 0) {
      throw new ApiRouteError("TEAM_NOT_FOUND", 404)
    }

    if ((await client.exists(playerKey)) === 0) {
      throw new ApiRouteError("PLAYER_NOT_FOUND", 404)
    }

    await client.hset(playerKey, { ready: "0" })
    await client.hincrby(gameKey, "revision", 1)

    return {
      status: 200,
      data: {
        playerId: params.playerId,
        ready: false,
      },
    }
  },
})
