import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiErrorCode } from "@/contracts/gameData"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { GameState } from "@/lib/game/state"
import { redisKeys } from "@/lib/game/redisKeys"
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
  }: ApiEndpointInput<
    z.output<typeof GameParamsSchema>,
    z.output<typeof UpdateGameBodySchema>
  >) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)

    const existing = await client.hgetall(gameKey)
    if (!existing || Object.keys(existing).length === 0) {
      throw new ApiRouteError(ApiErrorCode.GAME_NOT_FOUND, 404)
    }

    const nextValues: Record<string, string> = {}
    if (body.name) {
      nextValues.name = body.name
    }
    if (typeof body.level === "number") {
      nextValues.level = String(body.level)
    }

    if (Object.keys(nextValues).length > 0) {
      await client.hset(gameKey, nextValues)
      await client.hincrby(gameKey, "revision", 1)
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
