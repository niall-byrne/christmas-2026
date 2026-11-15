import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { gameStateChannel } from "@/lib/game/realtimeChannel"
import { redisBroker } from "@/lib/redis/broker"
import { GameParamsSchema } from "@/schemas/gameData/game"
import { z } from "zod"

export const dynamic = "force-dynamic"

class GameEventsEndpoint extends ApiEndpoint<typeof GameParamsSchema> {
  protected override paramsSchema = GameParamsSchema

  protected execute({
    params,
    request,
  }: ApiEndpointInput<z.output<typeof GameParamsSchema>, unknown>) {
    return redisBroker.createStreamResponse(
      gameStateChannel(params.gameId),
      request
    )
  }
}

export const GET = new GameEventsEndpoint().handle
