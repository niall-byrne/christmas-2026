import "server-only"
import type { ApiEndpointLogger } from "@/contracts/game/api/logger"
import { InvalidGameStateError } from "@/game/api/error/state"
import { GameState } from "@/game/api/redis/state"
import { gameStateChannel } from "@/game/api/redis/gameStateChannel"
import { redisBroker } from "@/redis/api/broker"

export async function publishGameStateChanged(
  gameId: string,
  logger: ApiEndpointLogger
): Promise<void> {
  try {
    const snapshot = await new GameState(gameId).read()
    if (!snapshot) {
      throw new InvalidGameStateError("COMMITTED_GAME_NOT_FOUND")
    }

    await redisBroker.publish(gameStateChannel(gameId), {
      type: "game.state.changed",
      data: snapshot,
    })
  } catch (error) {
    logger.warn("Game state event publication failed after commit", {
      id: { gameId },
      error,
    })
  }
}
