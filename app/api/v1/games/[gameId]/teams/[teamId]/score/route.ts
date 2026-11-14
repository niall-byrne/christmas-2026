import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiErrorCode } from "@/contracts/gameData"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { UpdateTeamScoreBodySchema } from "@/schemas/gameData/team"
import { z } from "zod"

const TeamScoreParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
})

class UpdateTeamScoreEndpoint extends ApiEndpoint<
  typeof TeamScoreParamsSchema,
  typeof UpdateTeamScoreBodySchema
> {
  protected override paramsSchema = TeamScoreParamsSchema
  protected override bodySchema = UpdateTeamScoreBodySchema

  protected async execute({
    params,
    body,
  }: ApiEndpointInput<
    z.output<typeof TeamScoreParamsSchema>,
    z.output<typeof UpdateTeamScoreBodySchema>
  >) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)

    if ((await client.exists(gameKey)) === 0) {
      throw new ApiRouteError(ApiErrorCode.GAME_NOT_FOUND, 404)
    }

    if ((await client.exists(teamKey)) === 0) {
      throw new ApiRouteError(ApiErrorCode.TEAM_NOT_FOUND, 404)
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
  }
}

export const PATCH = new UpdateTeamScoreEndpoint().handle
