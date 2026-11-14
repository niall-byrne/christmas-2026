import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { gameIds } from "@/lib/game/ids"
import { redisKeys } from "@/lib/game/redisKeys"
import { redisLookupKey } from "@/lib/game/redisLookupKey"
import { RedisClient } from "@/lib/redis/client"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { CreateTeamBodySchema } from "@/schemas/gameData/team"
import { z } from "zod"

class CreateTeamEndpoint extends ApiEndpoint<
  typeof GameParamsSchema,
  typeof CreateTeamBodySchema
> {
  protected override paramsSchema = GameParamsSchema
  protected override bodySchema = CreateTeamBodySchema

  protected async execute({
    params,
    body,
  }: ApiEndpointInput<
    z.output<typeof GameParamsSchema>,
    z.output<typeof CreateTeamBodySchema>
  >) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)

    const gameExists = await client.exists(gameKey)
    if (gameExists === 0) {
      throw new ApiRouteError("GAME_NOT_FOUND", 404)
    }

    const normalizedName = redisLookupKey(body.name)
    const normalizedColor = body.color.toLowerCase()
    const teamNamesKey = redisKeys.teamNames(params.gameId)
    const teamColorsKey = redisKeys.teamColors(params.gameId)
    const teamId = gameIds.createEntityId()
    const teamKey = redisKeys.team(params.gameId, teamId)

    if ((await client.sismember(teamNamesKey, normalizedName)) === 1) {
      throw new ApiRouteError("TEAM_NAME_NOT_AVAILABLE", 409)
    }

    if ((await client.sismember(teamColorsKey, normalizedColor)) === 1) {
      throw new ApiRouteError("TEAM_COLOUR_NOT_AVAILABLE", 409)
    }

    await client.hset(teamKey, {
      name: body.name,
      color: normalizedColor,
      score: "0",
    })
    await client.sadd(redisKeys.teams(params.gameId), teamId)
    await client.sadd(teamNamesKey, normalizedName)
    await client.sadd(teamColorsKey, normalizedColor)
    await client.hincrby(gameKey, "revision", 1)

    return {
      status: 201,
      data: {
        teamId,
        name: body.name,
        color: normalizedColor,
        score: 0,
      },
    }
  }
}

export const POST = new CreateTeamEndpoint().handle
