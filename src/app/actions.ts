"use server"

import {
  realtimeMessageChannelSchema,
  RealtimeChannelMessage,
} from "@/schemas/redis/channelMessage"
import { realtimeChannel } from "@/lib/game/realtimeChannel"
import { redisBroker } from "@/lib/redis/broker"

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
