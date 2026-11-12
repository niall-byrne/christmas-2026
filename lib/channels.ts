import { RealtimeChannel } from "@/lib/realtime/channel"
import { realtimeMessageChannelSchema } from "@/schemas/channelMessage"

export const messageChannel = new RealtimeChannel(
  "realtime:messages",
  realtimeMessageChannelSchema
)
