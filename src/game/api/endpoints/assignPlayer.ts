import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { GAME_SCRIPT_CONTRACT_ERROR } from "@/contracts/game/api/data/gameScript"
import { GameScriptContractError } from "@/game/api/redis/scripts/errors/gameScriptContract"
import { GameMutationEndpointBase } from "@/game/api/endpoints/bases/gameMutationEndpointBase"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { assignPlayerScript } from "@/game/api/redis/scripts/assignPlayer"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"
import { RedisClient } from "@/redis/api/client"
import { TeamParamsSchema } from "@/schemas/game/api/data/team"
import { z } from "zod"

function parsePlayerStateResult(
  result: Array<string | number>,
  readyOffset: number
): { offset: number; name: string; ready: boolean } {
  const offset = result[0] === GAME_SCRIPT_RESULT.NO_OP ? 1 : 0
  const name = result[offset]
  const ready = result[offset + readyOffset]
  if (typeof name !== "string" || (ready !== "0" && ready !== "1")) {
    throw new GameScriptContractError(GAME_SCRIPT_CONTRACT_ERROR.PLAYER_STATE)
  }
  return { offset, name, ready: ready === "1" }
}

class AssignPlayerEndpoint extends GameMutationEndpointBase<
  typeof TeamParamsSchema
> {
  protected override paramsSchema = TeamParamsSchema
  protected override requiresPlayerAuth = true

  protected async execute({
    params,
    logger,
    playerIdentity,
  }: ApiEndpointInput<z.output<typeof TeamParamsSchema>, unknown>) {
    const player = this.requirePlayerIdentity(playerIdentity)
    const playerKey = redisKeys.gamePlayer(params.gameId, player.playerId)
    const result = await executeGameScript(
      RedisClient.getClient(),
      assignPlayerScript,
      [
        redisKeys.game(params.gameId),
        redisKeys.team(params.gameId, params.teamId),
        redisKeys.teamPlayers(params.gameId, params.teamId),
        playerKey,
        redisKeys.players(params.gameId),
        redisKeys.teams(params.gameId),
      ],
      [player.playerId, params.teamId]
    )

    await this.publishMutationState(params.gameId, logger, result)

    const { name, ready } = parsePlayerStateResult(result, 1)

    return {
      status: 200,
      data: {
        playerId: player.playerId,
        name,
        teamId: params.teamId,
        ready,
      },
    }
  }
}

export const POST = new AssignPlayerEndpoint().handle

import { leaveTeamScript } from "@/game/api/redis/scripts/leaveTeam"

class LeaveTeamEndpoint extends GameMutationEndpointBase<
  typeof TeamParamsSchema
> {
  protected override paramsSchema = TeamParamsSchema
  protected override requiresPlayerAuth = true

  protected async execute({
    params,
    logger,
    playerIdentity,
  }: ApiEndpointInput<z.output<typeof TeamParamsSchema>, unknown>) {
    const player = this.requirePlayerIdentity(playerIdentity)
    const playerKey = redisKeys.gamePlayer(params.gameId, player.playerId)
    const result = await executeGameScript(
      RedisClient.getClient(),
      leaveTeamScript,
      [
        redisKeys.game(params.gameId),
        redisKeys.team(params.gameId, params.teamId),
        redisKeys.teamPlayers(params.gameId, params.teamId),
        playerKey,
        redisKeys.teams(params.gameId),
      ],
      [player.playerId, params.teamId]
    )

    await this.publishMutationState(params.gameId, logger, result)

    const { offset, name, ready } = parsePlayerStateResult(result, 2)
    const currentTeamId = result[offset + 1]
    if (typeof currentTeamId !== "string") {
      throw new GameScriptContractError(GAME_SCRIPT_CONTRACT_ERROR.PLAYER_STATE)
    }

    return {
      status: 200,
      data: {
        playerId: player.playerId,
        name,
        teamId: currentTeamId || null,
        ready,
      },
    }
  }
}

export const DELETE = new LeaveTeamEndpoint().handle
