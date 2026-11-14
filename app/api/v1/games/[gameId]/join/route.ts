import "server-only"
import { Authorization } from "@/lib/api/auth"
import { createEndpoint, ApiRouteError } from "@/lib/api/endpoint"
import { verifyPassword } from "@/lib/game/helpers"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema, JoinGameBodySchema } from "@/schemas/gameData/game"

export const POST = createEndpoint({
  paramsSchema: GameParamsSchema,
  bodySchema: JoinGameBodySchema,
  handler: async ({ params, body }) => {
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
  },
})
