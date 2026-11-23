import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { GameMutationEndpointBase } from "@/game/api/endpoints/bases/gameMutationEndpointBase"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { setReadyStatusScript } from "@/game/api/redis/scripts/setReadyStatus"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema } from "@/schemas/game/api/game"
import { z } from "zod"

class MarkPlayerReadyEndpoint extends GameMutationEndpointBase<
  typeof GameParamsSchema
> {
  protected override paramsSchema = GameParamsSchema
  protected override requiresPlayerAuth = true

  protected async execute({
    params,
    logger,
    playerIdentity,
  }: ApiEndpointInput<z.output<typeof GameParamsSchema>, unknown>) {
    const player = this.requirePlayerIdentity(playerIdentity)
    const client = RedisClient.getClient()
    const playerKey = redisKeys.gamePlayer(params.gameId, player.playerId)

    const result = await executeGameScript(
      client,
      setReadyStatusScript,
      [
        redisKeys.game(params.gameId),
        playerKey,
        redisKeys.teams(params.gameId),
      ],
      ["1"]
    )

    await this.publishMutationState(params.gameId, logger, result)

    return {
      status: 200,
      data: {
        playerId: player.playerId,
        ready: true,
      },
    }
  }
}

export const POST = new MarkPlayerReadyEndpoint().handle

class MarkPlayerNotReadyEndpoint extends GameMutationEndpointBase<
  typeof GameParamsSchema
> {
  protected override paramsSchema = GameParamsSchema
  protected override requiresPlayerAuth = true

  protected async execute({
    params,
    logger,
    playerIdentity,
  }: ApiEndpointInput<z.output<typeof GameParamsSchema>, unknown>) {
    const player = this.requirePlayerIdentity(playerIdentity)
    const client = RedisClient.getClient()
    const playerKey = redisKeys.gamePlayer(params.gameId, player.playerId)

    const result = await executeGameScript(
      client,
      setReadyStatusScript,
      [
        redisKeys.game(params.gameId),
        playerKey,
        redisKeys.teams(params.gameId),
      ],
      ["0"]
    )

    await this.publishMutationState(params.gameId, logger, result)

    return {
      status: 200,
      data: {
        playerId: player.playerId,
        ready: false,
      },
    }
  }
}

export const DELETE = new MarkPlayerNotReadyEndpoint().handle
