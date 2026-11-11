"use server"

import { messageChannel } from "@/lib/channels"
import { redisBroker } from "@/lib/realtime/broker"

export async function sendMessage(text: string): Promise<void> {
  await redisBroker.publish(messageChannel, {
    id: crypto.randomUUID(),
    text,
    createdAt: new Date().toLocaleTimeString(),
  })
}
