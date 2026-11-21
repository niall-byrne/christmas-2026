import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiErrorCode } from "@/contracts/gameData"
import { Authorization } from "@/lib/api/auth"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { gameAuthRateLimiter } from "@/lib/game/joinRateLimit"
import { gamePasswords } from "@/lib/game/password"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema, JoinGameBodySchema } from "@/schemas/gameData/game"
import { z } from "zod"

class JoinGameEndpoint extends ApiEndpoint<
  typeof GameParamsSchema,
  typeof JoinGameBodySchema
> {
  protected override paramsSchema = GameParamsSchema
  protected override bodySchema = JoinGameBodySchema
  protected override requiresAuth = false

  protected async execute({
    params,
    body,
    request,
  }: ApiEndpointInput<
    z.output<typeof GameParamsSchema>,
    z.output<typeof JoinGameBodySchema>
  >) {
    await gameAuthRateLimiter.enforce(request)

    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const storedHash = await client.hget(gameKey, "password_hash")

    if (!storedHash) {
      throw new ApiRouteError(ApiErrorCode.GAME_NOT_FOUND, 404)
    }

    if (!(await gamePasswords.verify(body.password, storedHash))) {
      throw new ApiRouteError(ApiErrorCode.INCORRECT_GAME_PASSWORD, 401)
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

export const POST = new JoinGameEndpoint().handle
