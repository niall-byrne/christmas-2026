import { NextRequest } from "next/server"
import { messageChannel } from "@/lib/channels"
import { redisBroker } from "@/lib/realtime/broker"

export const dynamic = "force-dynamic"

export function GET(req: NextRequest) {
  return redisBroker.createStreamResponse(messageChannel, req)
}
