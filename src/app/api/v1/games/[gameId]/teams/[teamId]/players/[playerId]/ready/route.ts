import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { redisKeys } from "@/lib/game/redisKeys"
import { publishGameStateChanged } from "@/lib/game/publishState"
import { executeGameScript } from "@/lib/game/redisScripts/execute"
import { GAME_SCRIPT_RESULT } from "@/lib/game/redisScripts/resultCodes"
import { setReadyStatusScript } from "@/lib/game/redisScripts/setReadyStatus"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { z } from "zod"

const ReadyParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
  playerId: z.string().regex(/^[a-z0-9]{24}$/),
})

class MarkPlayerReadyEndpoint extends ApiEndpoint<typeof ReadyParamsSchema> {
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

class MarkPlayerNotReadyEndpoint extends ApiEndpoint<typeof ReadyParamsSchema> {
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
