import { RedisChannel } from "@/lib/redis/channel"
import { realtimeMessageChannelSchema } from "@/schemas/redis/channelMessage"

export const realtimeChannel = new RedisChannel(
  "realtime:messages",
  realtimeMessageChannelSchema
)
