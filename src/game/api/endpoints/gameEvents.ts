import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { ApiEndpointBase } from "@/game/api/endpoints/bases/apiEndpointBase"
import { gameStateChannel } from "@/game/api/redis/gameStateChannel"
import { redisBroker } from "@/redis/api/broker"
import { GameParamsSchema } from "@/schemas/game/api/game"
import { z } from "zod"

export const dynamic = "force-dynamic"

class GameEventsEndpoint extends ApiEndpointBase<typeof GameParamsSchema> {
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
