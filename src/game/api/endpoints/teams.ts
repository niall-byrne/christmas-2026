import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { ApiEndpointBase } from "@/game/api/endpoints/bases/apiEndpointBase"
import { gameIds } from "@/game/api/services/ids"
import { publishGameStateChanged } from "@/game/api/redis/publishState"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { redisLookupKey } from "@/game/api/redis/redisLookupKey"
import { createTeamScript } from "@/game/api/redis/scripts/createTeam"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema } from "@/schemas/game/api/game"
import { CreateTeamBodySchema } from "@/schemas/game/api/data/team"
import { z } from "zod"

class CreateTeamEndpoint extends ApiEndpointBase<
  typeof GameParamsSchema,
  typeof CreateTeamBodySchema
> {
  protected override paramsSchema = GameParamsSchema
  protected override bodySchema = CreateTeamBodySchema

  protected async execute({
    params,
    body,
    logger,
  }: ApiEndpointInput<
    z.output<typeof GameParamsSchema>,
    z.output<typeof CreateTeamBodySchema>
  >) {
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(params.gameId)
    const normalizedName = redisLookupKey(body.name)
    const normalizedColor = body.color.toLowerCase()
    const teamNamesKey = redisKeys.teamNames(params.gameId)
    const teamColorsKey = redisKeys.teamColors(params.gameId)
    const teamId = gameIds.createEntityId()
    const teamKey = redisKeys.team(params.gameId, teamId)

    const result = await executeGameScript(
      client,
      createTeamScript,
      [
        gameKey,
        redisKeys.teams(params.gameId),
        teamNamesKey,
        teamColorsKey,
        teamKey,
      ],
      [normalizedName, normalizedColor, teamId, body.name, normalizedColor, "0"]
    )

    if (result[0] !== teamId) {
      throw new Error("Create-team script returned an unexpected team ID")
    }

    await publishGameStateChanged(params.gameId, logger)

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
