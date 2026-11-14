import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { Authorization } from "@/lib/api/auth"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { verifyPassword } from "@/lib/game/helpers"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema, JoinGameBodySchema } from "@/schemas/gameData/game"
import { z } from "zod"

class JoinGameEndpoint extends ApiEndpoint<
  typeof GameParamsSchema,
  typeof JoinGameBodySchema
> {
  constructor() {
    super({
      paramsSchema: GameParamsSchema,
      bodySchema: JoinGameBodySchema,
    })
  }

  protected async execute({
    params,
    body,
  }: ApiEndpointInput<
    z.output<typeof GameParamsSchema>,
    z.output<typeof JoinGameBodySchema>
  >) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const storedHash = await client.hget(gameKey, "password_hash")

    if (!storedHash) {
      throw new ApiRouteError("GAME_NOT_FOUND", 404)
    }

    if (!verifyPassword(body.password, storedHash)) {
      throw new ApiRouteError("INCORRECT_GAME_PASSWORD", 401)
    }

    return {
      status: 200,
      data: { gameId: params.gameId },
      headers: {
        "Set-Cookie": Authorization.responseHeaderFactory(params.gameId),
      },
    }
  }
}

export const POST = new JoinGameEndpoint().handler
