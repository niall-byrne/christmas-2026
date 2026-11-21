import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiErrorCode, GAME_COMPLETE_TTL_SECONDS } from "@/contracts/gameData"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { GameState } from "@/lib/game/state"
import { redisKeys } from "@/lib/game/redisKeys"
import { publishGameStateChanged } from "@/lib/game/publishState"
import { executeGameScript } from "@/lib/game/redisScripts/execute"
import { GAME_SCRIPT_RESULT } from "@/lib/game/redisScripts/resultCodes"
import { updateGameScript } from "@/lib/game/redisScripts/updateGame"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema, UpdateGameBodySchema } from "@/schemas/gameData/game"
import { z } from "zod"

class ReadGameEndpoint extends ApiEndpoint<typeof GameParamsSchema> {
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

class UpdateGameEndpoint extends ApiEndpoint<
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
        redisKeys.playerKeyPrefixSuffix,
      ]
    )

    if (result[0] !== GAME_SCRIPT_RESULT.NO_OP) {
      await publishGameStateChanged(params.gameId, logger)
    }

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
