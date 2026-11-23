import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { Authorization } from "@/game/api/auth"
import { ApiRouteError } from "@/game/api/error/endpoint"
import { ApiEndpointBase } from "@/game/api/endpoints/bases/apiEndpointBase"
import { gameAuthRateLimiter } from "@/game/api/services/joinRateLimit"
import { gamePasswords } from "@/game/api/services/password"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema, JoinGameBodySchema } from "@/schemas/game/api/game"
import { z } from "zod"

class JoinGameEndpoint extends ApiEndpointBase<
  typeof GameParamsSchema,
  typeof JoinGameBodySchema
> {
  protected override paramsSchema = GameParamsSchema
  protected override bodySchema = JoinGameBodySchema
  protected override requiresAnonymousSession = false

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
