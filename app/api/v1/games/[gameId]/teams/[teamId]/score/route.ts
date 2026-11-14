import "server-only"
import { createEndpoint, ApiRouteError } from "@/lib/api/endpoint"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { UpdateTeamScoreBodySchema } from "@/schemas/gameData/team"
import { z } from "zod"

const TeamScoreParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
})

export const PATCH = createEndpoint({
  paramsSchema: TeamScoreParamsSchema,
  bodySchema: UpdateTeamScoreBodySchema,
  auth: true,
  handler: async ({ params, body }) => {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)

    if ((await client.exists(gameKey)) === 0) {
      throw new ApiRouteError("GAME_NOT_FOUND", 404)
    }

    if ((await client.exists(teamKey)) === 0) {
      throw new ApiRouteError("TEAM_NOT_FOUND", 404)
    }

    const score = await client.hincrby(teamKey, "score", body.delta)
    await client.hincrby(gameKey, "revision", 1)

    return {
      status: 200,
      data: {
        teamId: params.teamId,
        score: Number(score),
      },
    }
  },
})
