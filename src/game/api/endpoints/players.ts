import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { Authorization } from "@/game/api/auth"
import { AuthorizationError } from "@/game/api/error/auth"
import { ApiRouteError } from "@/game/api/error/endpoint"
import { GAME_SCRIPT_CONTRACT_ERROR } from "@/contracts/game/api/data/gameScript"
import { GameScriptContractError } from "@/game/api/redis/scripts/errors/gameScriptContract"
import { GameMutationEndpointBase } from "@/game/api/endpoints/bases/gameMutationEndpointBase"
import { gameIds } from "@/game/api/services/ids"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { redisLookupKey } from "@/game/api/redis/redisLookupKey"
import { addPlayerScript } from "@/game/api/redis/scripts/addPlayer"
import { executeGameScript } from "@/game/api/redis/scripts/execute"
import { RedisClient } from "@/redis/api/client"
import { GameParamsSchema } from "@/schemas/game/api/game"
import { AddPlayerBodySchema } from "@/schemas/game/api/data/player"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { z } from "zod"

class ClaimPlayerEndpoint extends GameMutationEndpointBase<
  typeof GameParamsSchema,
  typeof AddPlayerBodySchema
> {
  protected override paramsSchema = GameParamsSchema
  protected override bodySchema = AddPlayerBodySchema

  private async findExistingClaim(
    request: Request,
    gameId: string
  ): Promise<{ playerId: string; name: string; teamId: string | null } | null> {
    let identity: ReturnType<typeof Authorization.authorizePlayerRequest>
    try {
      identity = Authorization.authorizePlayerRequest(request, gameId)
    } catch (error) {
      if (error instanceof AuthorizationError) return null
      throw error
    }

    const client = RedisClient.getClient()
    const playerKey = redisKeys.gamePlayer(gameId, identity.playerId)
    const [name, isClaimed] = await Promise.all([
      client.hget(playerKey, "name"),
      client.sismember(redisKeys.players(gameId), identity.playerId),
    ])
    if (isClaimed !== 1 || !name) return null

    const teamId = await client.hget(playerKey, "team_id")
    return {
      playerId: identity.playerId,
      name,
      teamId: teamId || null,
    }
  }

  private createClaimResponse(
    status: number,
    gameId: string,
    claim: { playerId: string; name: string; teamId: string | null }
  ) {
    return {
      status,
      data: claim,
      headers: {
        "Set-Cookie": Authorization.playerResponseHeaderFactory(
          gameId,
          claim.playerId
        ),
      },
    }
  }

  protected async execute({
    params,
    body,
    request,
    logger,
  }: ApiEndpointInput<
    z.output<typeof GameParamsSchema>,
    z.output<typeof AddPlayerBodySchema>
  >) {
    const client = RedisClient.getClient()
    const normalizedName = redisLookupKey(body.name)
    const existingClaim = await this.findExistingClaim(request, params.gameId)
    if (existingClaim) {
      if (redisLookupKey(existingClaim.name) !== normalizedName) {
        throw new ApiRouteError(ApiErrorCode.PLAYER_IDENTITY_EXISTS, 409)
      }
      return this.createClaimResponse(200, params.gameId, existingClaim)
    }

    const playerId = gameIds.createEntityId()
    const playerKey = redisKeys.gamePlayer(params.gameId, playerId)
    const result = await executeGameScript(
      client,
      addPlayerScript,
      [
        redisKeys.game(params.gameId),
        redisKeys.cards(params.gameId),
        redisKeys.playerNames(params.gameId),
        redisKeys.players(params.gameId),
        playerKey,
      ],
      [normalizedName, playerId, body.name]
    )
    const [createdPlayerId, name, ready] = result

    if (createdPlayerId !== playerId) {
      throw new GameScriptContractError(
        GAME_SCRIPT_CONTRACT_ERROR.ADD_PLAYER_ID
      )
    }
    if (typeof name !== "string") {
      throw new GameScriptContractError(
        GAME_SCRIPT_CONTRACT_ERROR.ADD_PLAYER_NAME
      )
    }
    if (ready !== "0") {
      throw new GameScriptContractError(
        GAME_SCRIPT_CONTRACT_ERROR.ADD_PLAYER_READY_STATUS
      )
    }

    await this.publishGameStateChanged(params.gameId, logger)

    return this.createClaimResponse(201, params.gameId, {
      playerId: createdPlayerId,
      name,
      teamId: null,
    })
  }
}

export const POST = new ClaimPlayerEndpoint().handle
