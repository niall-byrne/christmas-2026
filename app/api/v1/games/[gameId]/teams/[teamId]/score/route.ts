import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { redisKeys } from "@/lib/game/redisKeys"
import { publishGameStateChanged } from "@/lib/game/publishState"
import { executeGameScript } from "@/lib/game/redisScripts/execute"
import { GAME_SCRIPT_RESULT } from "@/lib/game/redisScripts/resultCodes"
import { updateTeamScoreScript } from "@/lib/game/redisScripts/updateTeamScore"
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
    logger,
  }: ApiEndpointInput<
    z.output<typeof TeamScoreParamsSchema>,
    z.output<typeof UpdateTeamScoreBodySchema>
  >) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)

    const result = await executeGameScript(
      client,
      updateTeamScoreScript,
      [gameKey, teamKey],
      [String(body.delta)]
    )
    const isNoOp = result[0] === GAME_SCRIPT_RESULT.NO_OP
    const score = isNoOp ? result[1] : result[0]

    if (
      (typeof score !== "number" && typeof score !== "string") ||
      !Number.isSafeInteger(Number(score))
    ) {
      throw new Error("Update-score script returned an unexpected score")
    }

    if (!isNoOp) {
      await publishGameStateChanged(params.gameId, logger)
    }

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
