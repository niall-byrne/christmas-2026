import { RedisChannel } from "@/redis/shared/channel"
import { gameEventSchema } from "@/schemas/game/redis/gameStateEvent"

export function gameStateChannel(gameId: string) {
  return new RedisChannel(`game:${gameId}:events`, gameEventSchema)
}
