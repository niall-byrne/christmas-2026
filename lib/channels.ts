import { z } from "zod";
import { RealtimeChannel } from "@/lib/realtime/channel";

export const messageSchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(1, "Message cannot be empty").max(500),
  createdAt: z.string(),
});

export type RealtimeMessage = z.infer<typeof messageSchema>;

export const messageChannel = new RealtimeChannel(
  "realtime:messages",
  messageSchema,
);
