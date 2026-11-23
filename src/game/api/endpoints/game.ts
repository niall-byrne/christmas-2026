import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import {
  ApiErrorCode,
  GAME_COMPLETE_TTL_SECONDS,
} from "@/contracts/game/api/data"
import { ApiRouteError } from "@/game/api/error/endpoint"
import { ApiEndpointBase } from "@/game/api/endpoints/bases/apiEndpointBase"
import { GameMutationEndpointBase } from "@/game/api/endpoints/bases/gameMutationEndpointBase"
import { GameState } from "@/game/api/redis/state"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { updateGameScript } from "@/game/api/redis/scripts/updateGame"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema, UpdateGameBodySchema } from "@/schemas/game/api/game"
import { z } from "zod"

class ReadGameEndpoint extends ApiEndpointBase<typeof GameParamsSchema> {
  protected override paramsSchema = GameParamsSchema

  protected async execute({
    params,
    logger,
  }: ApiEndpointInput<z.output<typeof GameParamsSchema>, unknown>) {
    const state = await new GameState(params.gameId).read()
    if (!state) {
      throw new ApiRouteError(ApiErrorCode.GAME_NOT_FOUND, 404)
    }

    logger.info("Loaded game snapshot", {
      id: { gameId: params.gameId },
    })

    return {
      status: 200,
      data: state,
    }
  }
}

export const GET = new ReadGameEndpoint().handle

class UpdateGameEndpoint extends GameMutationEndpointBase<
  typeof GameParamsSchema,
  typeof UpdateGameBodySchema
> {
  protected override paramsSchema = GameParamsSchema
  protected override bodySchema = UpdateGameBodySchema

  protected async execute({
    params,
    body,
    logger,
  }: ApiEndpointInput<
    z.output<typeof GameParamsSchema>,
    z.output<typeof UpdateGameBodySchema>
  >) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)

    const result = await executeGameScript(
      client,
      updateGameScript,
      redisKeys.gameExpirationKeys(params.gameId),
      [
        body.name ?? "",
        body.level === undefined ? "" : String(body.level),
        String(GAME_COMPLETE_TTL_SECONDS),
        redisKeys.teamPrefix(params.gameId),
        redisKeys.teamPlayersSuffix,
      ]
    )

    await this.publishMutationState(params.gameId, logger, result)

    const refreshed = await client.hgetall(gameKey)
    const createdAt = refreshed.created_at ?? new Date().toISOString()
    const name = refreshed.name ?? ""
    const level = Number(refreshed.level ?? 0)

    return {
      status: 200,
      data: {
        gameId: params.gameId,
        name,
        level,
        createdAt,
      },
    }
  }
}

export const PATCH = new UpdateGameEndpoint().handle
