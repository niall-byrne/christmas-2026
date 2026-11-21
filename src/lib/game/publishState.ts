import "server-only"
import type { ApiEndpointLogger } from "@/contracts/api/logger"
import { InvalidGameStateError } from "@/lib/game/error/state"
import { GameState } from "@/lib/game/state"
import { gameStateChannel } from "@/lib/game/realtimeChannel"
import { redisBroker } from "@/lib/redis/broker"

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
