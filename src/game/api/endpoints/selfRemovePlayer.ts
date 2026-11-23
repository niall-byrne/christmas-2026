import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { GameMutationEndpointBase } from "@/game/api/endpoints/bases/gameMutationEndpointBase"
import { Authorization } from "@/game/api/auth"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { removePlayerClaimScript } from "@/game/api/redis/scripts/removePlayerClaim"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema } from "@/schemas/game/api/game"
import { z } from "zod"

class SelfRemovePlayerEndpoint extends GameMutationEndpointBase<
  typeof GameParamsSchema
> {
  protected override paramsSchema = GameParamsSchema
  protected override requiresPlayerAuth = true

  protected async execute({
    params,
    logger,
    playerIdentity,
  }: ApiEndpointInput<z.output<typeof GameParamsSchema>, unknown>) {
    const player = this.requirePlayerIdentity(playerIdentity)
    await executeGameScript(
      RedisClient.getClient(),
      removePlayerClaimScript,
      [
        redisKeys.game(params.gameId),
        redisKeys.players(params.gameId),
        redisKeys.playerNames(params.gameId),
        redisKeys.gamePlayer(params.gameId, player.playerId),
      ],
      [player.playerId]
    )
    await this.publishGameStateChanged(params.gameId, logger)

    const expiredCookie = Authorization.playerResponseHeaderFactory(
      params.gameId,
      player.playerId,
      {
        maxAgeSeconds: 0,
      }
    )

    return {
      status: 200,
      data: { message: "Player removed" },
      headers: { "Set-Cookie": expiredCookie },
    }
  }
}

export const DELETE = new SelfRemovePlayerEndpoint().handle
