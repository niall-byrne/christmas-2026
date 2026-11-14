import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { redisKeys } from "@/lib/game/redisKeys"
import { executeGameScript } from "@/lib/game/redisScripts/execute"
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
  }: ApiEndpointInput<z.output<typeof ReadyParamsSchema>, unknown>) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)
    const playerKey = redisKeys.player(
      params.gameId,
      params.teamId,
      params.playerId
    )

    await executeGameScript(
      client,
      setReadyStatusScript,
      [gameKey, teamKey, playerKey],
      ["1"]
    )

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
  }: ApiEndpointInput<z.output<typeof ReadyParamsSchema>, unknown>) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const teamKey = redisKeys.team(params.gameId, params.teamId)
    const playerKey = redisKeys.player(
      params.gameId,
      params.teamId,
      params.playerId
    )

    await executeGameScript(
      client,
      setReadyStatusScript,
      [gameKey, teamKey, playerKey],
      ["0"]
    )

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
