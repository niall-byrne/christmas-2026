import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { ApiEndpointBase } from "@/game/api/endpoints/bases/apiEndpointBase"
import { GameMutationEndpointBase } from "@/game/api/endpoints/bases/gameMutationEndpointBase"
import { redisKeys } from "@/game/api/redis/redisKeys"
import {
  approveRemovePlayerScript,
  cancelRemovePlayerScript,
} from "@/game/api/redis/scripts/removePlayerVote"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema } from "@/schemas/game/api/game"
import { z } from "zod"

const RemoveVoteParamsSchema = GameParamsSchema.extend({
  playerId: z.string().regex(/^[a-z0-9]{24}$/),
})

class ApproveRemovePlayerEndpoint extends GameMutationEndpointBase<
  typeof RemoveVoteParamsSchema
> {
  protected override paramsSchema = RemoveVoteParamsSchema
  protected override requiresPlayerAuth = true

  protected async execute({
    params,
    logger,
    playerIdentity,
  }: ApiEndpointInput<z.output<typeof RemoveVoteParamsSchema>, unknown>) {
    const caller = this.requirePlayerIdentity(playerIdentity)
    const result = await executeGameScript(
      RedisClient.getClient(),
      approveRemovePlayerScript,
      [
        redisKeys.game(params.gameId),
        redisKeys.players(params.gameId),
        redisKeys.playerNames(params.gameId),
        redisKeys.gamePlayer(params.gameId, params.playerId),
        redisKeys.removePlayerVote(params.gameId, params.playerId),
        redisKeys.removePlayerVoteApprovals(params.gameId, params.playerId),
      ],
      [caller.playerId, params.playerId]
    )

    const completed = result[0] !== GAME_SCRIPT_RESULT.NO_OP
    const offset = completed ? 0 : 1
    const approved = Number(result[offset] ?? 0)
    const required = Number(result[offset + 1] ?? 0)
    const targetRemoved = completed && result[offset + 2] === "1"
    if (completed) {
      await this.publishMutationState(params.gameId, logger, result)
    }

    return {
      status: 200,
      data: {
        targetPlayerId: params.playerId,
        approvals: approved,
        requiredApprovals: required,
        pending: !targetRemoved,
        removed: targetRemoved,
      },
    }
  }
}

export const POST = new ApproveRemovePlayerEndpoint().handle

class CancelRemovePlayerEndpoint extends ApiEndpointBase<
  typeof RemoveVoteParamsSchema
> {
  protected override paramsSchema = RemoveVoteParamsSchema
  protected override requiresPlayerAuth = true

  protected async execute({
    params,
    playerIdentity,
  }: ApiEndpointInput<z.output<typeof RemoveVoteParamsSchema>, unknown>) {
    const caller = this.requirePlayerIdentity(playerIdentity)
    await executeGameScript(
      RedisClient.getClient(),
      cancelRemovePlayerScript,
      [
        redisKeys.game(params.gameId),
        redisKeys.removePlayerVote(params.gameId, params.playerId),
        redisKeys.removePlayerVoteApprovals(params.gameId, params.playerId),
      ],
      [caller.playerId]
    )

    const pending = await RedisClient.getClient().exists(
      redisKeys.removePlayerVote(params.gameId, params.playerId)
    )

    return {
      status: 200,
      data: { targetPlayerId: params.playerId, pending: pending === 1 },
    }
  }
}

export const DELETE = new CancelRemovePlayerEndpoint().handle
