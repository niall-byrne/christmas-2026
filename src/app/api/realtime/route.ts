import { NextRequest } from "next/server"
import { realtimeChannel } from "@/lib/game/realtimeChannel"
import { redisBroker } from "@/lib/redis/broker"

export const dynamic = "force-dynamic"

export function GET(req: NextRequest) {
  return redisBroker.createStreamResponse(realtimeChannel, req)
}
