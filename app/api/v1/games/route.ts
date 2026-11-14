import "server-only"
import { Authorization } from "@/lib/api/auth"
import { createEndpoint } from "@/lib/api/endpoint"
import {
  createGameId,
  createPasswordSalt,
  hashPassword,
  serializeCardEntry,
} from "@/lib/game/helpers"
import { redisKeys } from "@/lib/game/redisKeys"
import { RedisClient } from "@/lib/redis/client"
import { GAME_LOBBY_LEVEL } from "@/contracts/gameData/game"
import { CreateGameBodySchema } from "@/schemas/gameData/game"

export const POST = createEndpoint({
  bodySchema: CreateGameBodySchema,
  handler: async ({ body }) => {
    const gameId = createGameId()
    const salt = createPasswordSalt()
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(gameId)
    const cardsKey = redisKeys.cards(gameId)

    const cardsLookup = Object.fromEntries(
      body.cards.map(({ recipient, identifier }) => [
        recipient.trim().replace(/\s+/g, " ").toLowerCase(),
        serializeCardEntry(recipient, identifier),
      ])
    )

    await client.hset(gameKey, {
      level: String(GAME_LOBBY_LEVEL),
      revision: "1",
      created_at: new Date().toISOString(),
      name: body.name,
      password_hash: hashPassword(body.password, salt),
      bonus_card: body.bonusCard,
    })

    if (Object.keys(cardsLookup).length > 0) {
      await client.hset(cardsKey, cardsLookup)
    }

    return {
      status: 201,
      data: {
        gameId,
        name: body.name,
        level: GAME_LOBBY_LEVEL,
      },
      headers: {
        "Set-Cookie": Authorization.responseHeaderFactory(gameId),
      },
    }
  },
})
