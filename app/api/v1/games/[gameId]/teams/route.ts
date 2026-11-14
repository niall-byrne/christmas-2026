import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { gameIds } from "@/lib/game/ids"
import { redisKeys } from "@/lib/game/redisKeys"
import { redisLookupKey } from "@/lib/game/redisLookupKey"
import { createTeamScript } from "@/lib/game/redisScripts/createTeam"
import { executeGameScript } from "@/lib/game/redisScripts/execute"
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
