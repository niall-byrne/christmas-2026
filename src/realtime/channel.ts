import { RedisChannel } from "@/redis/shared/channel"
import { realtimeMessageChannelSchema } from "@/schemas/realtime/channelMessage"

export const realtimeChannel = new RedisChannel(
  "realtime:messages",
  realtimeMessageChannelSchema
)
