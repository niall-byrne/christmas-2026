import { NextRequest } from "next/server"
import { realtimeChannel } from "@/realtime/channel"
import { redisBroker } from "@/redis/api/broker"

export const dynamic = "force-dynamic"

export function GET(req: NextRequest) {
  return redisBroker.createStreamResponse(realtimeChannel, req)
}
