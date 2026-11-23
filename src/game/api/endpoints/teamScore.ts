import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { GAME_SCRIPT_CONTRACT_ERROR } from "@/contracts/game/api/data/gameScript"
import { GameScriptContractError } from "@/game/api/redis/scripts/errors/gameScriptContract"
import { GameMutationEndpointBase } from "@/game/api/endpoints/bases/gameMutationEndpointBase"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"
import { updateTeamScoreScript } from "@/game/api/redis/scripts/updateTeamScore"
import { RedisClient } from "@/redis/api/client"
import {
  TeamParamsSchema,
  UpdateTeamScoreBodySchema,
} from "@/schemas/game/api/data/team"
import { z } from "zod"

class UpdateTeamScoreEndpoint extends GameMutationEndpointBase<
  typeof TeamParamsSchema,
  typeof UpdateTeamScoreBodySchema
> {
  protected override paramsSchema = TeamParamsSchema
  protected override bodySchema = UpdateTeamScoreBodySchema

  protected async execute({
    params,
    body,
    logger,
  }: ApiEndpointInput<
    z.output<typeof TeamParamsSchema>,
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
      throw new GameScriptContractError(GAME_SCRIPT_CONTRACT_ERROR.TEAM_SCORE)
    }

    await this.publishMutationState(params.gameId, logger, result)

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
