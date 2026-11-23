import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { GAME_SCRIPT_CONTRACT_ERROR } from "@/contracts/game/api/data/gameScript"
import { GameScriptContractError } from "@/game/api/redis/scripts/errors/gameScriptContract"
import { GameMutationEndpointBase } from "@/game/api/endpoints/bases/gameMutationEndpointBase"
import { gameIds } from "@/game/api/services/ids"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { redisLookupKey } from "@/game/api/redis/redisLookupKey"
import { createTeamScript } from "@/game/api/redis/scripts/createTeam"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema } from "@/schemas/game/api/game"
import {
  CreateTeamBodySchema,
  TeamParamsSchema,
} from "@/schemas/game/api/data/team"
import { z } from "zod"

class CreateTeamEndpoint extends GameMutationEndpointBase<
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
      throw new GameScriptContractError(
        GAME_SCRIPT_CONTRACT_ERROR.CREATE_TEAM_ID
      )
    }

    await this.publishGameStateChanged(params.gameId, logger)

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

import { deleteTeamScript } from "@/game/api/redis/scripts/deleteTeam"

class DeleteTeamEndpoint extends GameMutationEndpointBase<
  typeof TeamParamsSchema
> {
  protected override paramsSchema = TeamParamsSchema

  protected async execute({
    params,
    logger,
  }: ApiEndpointInput<z.output<typeof TeamParamsSchema>, unknown>) {
    const client = RedisClient.getClient()
    const teamKey = redisKeys.team(params.gameId, params.teamId)
    const teamName = await client.hget(teamKey, "name")
    const teamColor = await client.hget(teamKey, "color")

    await executeGameScript(
      client,
      deleteTeamScript,
      [
        redisKeys.game(params.gameId),
        redisKeys.teams(params.gameId),
        redisKeys.teamNames(params.gameId),
        redisKeys.teamColors(params.gameId),
        teamKey,
        redisKeys.teamPlayers(params.gameId, params.teamId),
        redisKeys.playerNames(params.gameId),
      ],
      [
        redisLookupKey(teamName ?? ""),
        (teamColor ?? "").toLowerCase(),
        params.teamId,
      ]
    )

    await this.publishGameStateChanged(params.gameId, logger)

    return {
      status: 200,
      data: { teamId: params.teamId, message: "Team deleted" },
    }
  }
}

export const DELETE = new DeleteTeamEndpoint().handle
