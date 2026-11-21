"use server"

import {
  realtimeMessageChannelSchema,
  RealtimeChannelMessage,
} from "@/schemas/realtime/channelMessage"
import { realtimeChannel } from "@/realtime/channel"
import { redisBroker } from "@/redis/api/broker"

export async function sendMessage(
  text: string
): Promise<RealtimeChannelMessage> {
  // Parse and validate the message object against the schema
  const message = realtimeMessageChannelSchema.parse({
    id: crypto.randomUUID(),
    text,
    createdAt: new Date().toLocaleTimeString(),
  })

  await redisBroker.publish(realtimeChannel, message)

  return message
}
