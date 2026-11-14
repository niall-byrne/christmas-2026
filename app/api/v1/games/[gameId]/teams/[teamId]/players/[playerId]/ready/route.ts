import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { z } from "zod"

const ReadyParamsSchema = GameParamsSchema.extend({
  teamId: z.string().regex(/^[a-z0-9]{24}$/),
  playerId: z.string().regex(/^[a-z0-9]{24}$/),
})

class MarkPlayerReadyEndpoint extends ApiEndpoint<typeof ReadyParamsSchema> {
  constructor() {
    super({ paramsSchema: ReadyParamsSchema, auth: true })
  }

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

    if ((await client.exists(gameKey)) === 0) {
      throw new ApiRouteError("GAME_NOT_FOUND", 404)
    }

    if ((await client.exists(teamKey)) === 0) {
      throw new ApiRouteError("TEAM_NOT_FOUND", 404)
    }

    if ((await client.exists(playerKey)) === 0) {
      throw new ApiRouteError("PLAYER_NOT_FOUND", 404)
    }

    await client.hset(playerKey, { ready: "1" })
    await client.hincrby(gameKey, "revision", 1)

    return {
      status: 200,
      data: {
        playerId: params.playerId,
        ready: true,
      },
    }
  }
}

export const POST = new MarkPlayerReadyEndpoint().handler

class MarkPlayerNotReadyEndpoint extends ApiEndpoint<typeof ReadyParamsSchema> {
  constructor() {
    super({ paramsSchema: ReadyParamsSchema, auth: true })
  }

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

    if ((await client.exists(gameKey)) === 0) {
      throw new ApiRouteError("GAME_NOT_FOUND", 404)
    }

    if ((await client.exists(teamKey)) === 0) {
      throw new ApiRouteError("TEAM_NOT_FOUND", 404)
    }

    if ((await client.exists(playerKey)) === 0) {
      throw new ApiRouteError("PLAYER_NOT_FOUND", 404)
    }

    await client.hset(playerKey, { ready: "0" })
    await client.hincrby(gameKey, "revision", 1)

    return {
      status: 200,
      data: {
        playerId: params.playerId,
        ready: false,
      },
    }
  }
}

export const DELETE = new MarkPlayerNotReadyEndpoint().handler
