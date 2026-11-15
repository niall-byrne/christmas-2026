import { RedisChannel } from "@/lib/redis/channel"
import { gameEventSchema } from "@/schemas/redis/gameStateEvent"
import { realtimeMessageChannelSchema } from "@/schemas/redis/channelMessage"

export const realtimeChannel = new RedisChannel(
  "realtime:messages",
  realtimeMessageChannelSchema
)

export function gameStateChannel(gameId: string) {
  return new RedisChannel(`game:${gameId}:events`, gameEventSchema)
}
