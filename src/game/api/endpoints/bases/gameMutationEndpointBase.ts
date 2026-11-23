import type { ApiEndpointLogger } from "@/contracts/game/api/logger"
import { ApiEndpointBase } from "@/game/api/endpoints/bases/apiEndpointBase"
import {
  INVALID_GAME_STATE_REASON,
  InvalidGameStateError,
} from "@/game/api/error/state"
import { GameState } from "@/game/api/redis/state"
import { gameStateChannel } from "@/game/api/redis/gameStateChannel"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"
import { GAME_STATE_CHANGED_EVENT_TYPE } from "@/schemas/game/redis/gameStateEvent"
import { redisBroker } from "@/redis/api/broker"
import { z } from "zod"

export abstract class GameMutationEndpointBase<
  TParams extends z.ZodType = z.ZodType,
  TBody extends z.ZodType = z.ZodType,
> extends ApiEndpointBase<TParams, TBody> {
  protected didMutate(result: Array<string | number>): boolean {
    return result[0] !== GAME_SCRIPT_RESULT.NO_OP
  }

  protected async publishMutationState(
    gameId: string,
    logger: ApiEndpointLogger,
    result: Array<string | number>
  ): Promise<void> {
    if (this.didMutate(result)) {
      await this.publishGameStateChanged(gameId, logger)
    }
  }

  protected async publishGameStateChanged(
    gameId: string,
    logger: ApiEndpointLogger
  ): Promise<void> {
    try {
      const snapshot = await new GameState(gameId).read()
      if (!snapshot) {
        throw new InvalidGameStateError(
          INVALID_GAME_STATE_REASON.COMMITTED_GAME_NOT_FOUND
        )
      }

      await redisBroker.publish(gameStateChannel(gameId), {
        type: GAME_STATE_CHANGED_EVENT_TYPE,
        data: snapshot,
      })
    } catch (error) {
      logger.warn("Game state event publication failed after commit", {
        id: { gameId },
        error,
      })
    }
  }
}
