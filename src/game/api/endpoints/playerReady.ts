import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { ApiEndpointBase } from "@/game/api/endpoints/bases/apiEndpointBase"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { publishGameStateChanged } from "@/game/api/redis/publishState"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"
import { setReadyStatusScript } from "@/game/api/redis/scripts/setReadyStatus"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema } from "@/schemas/game/api/game"
import { z } from "zod"

const ReadyParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
  playerId: z.string().regex(/^[a-z0-9]{24}$/),
})

class MarkPlayerReadyEndpoint extends ApiEndpointBase<
  typeof ReadyParamsSchema
> {
  protected override paramsSchema = ReadyParamsSchema

  protected async execute({
    params,
    logger,
  }: ApiEndpointInput<z.output<typeof ReadyParamsSchema>, unknown>) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)
    const playerKey = redisKeys.player(
      params.gameId,
      params.teamId,
      params.playerId
    )

    const result = await executeGameScript(
      client,
      setReadyStatusScript,
      [gameKey, teamKey, playerKey],
      ["1"]
    )

    if (result[0] !== GAME_SCRIPT_RESULT.NO_OP) {
      await publishGameStateChanged(params.gameId, logger)
    }

    return {
      status: 200,
      data: {
        playerId: params.playerId,
        ready: true,
      },
    }
  }
}

export const POST = new MarkPlayerReadyEndpoint().handle

class MarkPlayerNotReadyEndpoint extends ApiEndpointBase<
  typeof ReadyParamsSchema
> {
  protected override paramsSchema = ReadyParamsSchema

  protected async execute({
    params,
    logger,
  }: ApiEndpointInput<z.output<typeof ReadyParamsSchema>, unknown>) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)
    const playerKey = redisKeys.player(
      params.gameId,
      params.teamId,
      params.playerId
    )

    const result = await executeGameScript(
      client,
      setReadyStatusScript,
      [gameKey, teamKey, playerKey],
      ["0"]
    )

    if (result[0] !== GAME_SCRIPT_RESULT.NO_OP) {
      await publishGameStateChanged(params.gameId, logger)
    }

    return {
      status: 200,
      data: {
        playerId: params.playerId,
        ready: false,
      },
    }
  }
}

export const DELETE = new MarkPlayerNotReadyEndpoint().handle
