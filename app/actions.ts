"use server"

import {
  realtimeMessageChannelSchema,
  RealtimeChannelMessage,
} from "@/schemas/channelMessage"
import { messageChannel } from "@/lib/channels"
import { redisBroker } from "@/lib/realtime/broker"

export async function sendMessage(
  text: string
): Promise<RealtimeChannelMessage> {
  // Parse and validate the message object against the schema
  const message = realtimeMessageChannelSchema.parse({
    id: crypto.randomUUID(),
    text,
    createdAt: new Date().toLocaleTimeString(),
  })

  await redisBroker.publish(messageChannel, message)

  return message
}
