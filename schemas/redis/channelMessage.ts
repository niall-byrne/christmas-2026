import { z } from "zod"

export const realtimeMessageChannelSchema = z.object({
  id: z.uuid(),
  text: z.string().trim().min(1, "Message cannot be empty").max(500),
  createdAt: z.string(), // Represents the localized time string from new Date().toLocaleTimeString()
})

export type RealtimeChannelMessage = z.infer<
  typeof realtimeMessageChannelSchema
>
