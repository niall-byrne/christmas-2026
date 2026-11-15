import {
  GAME_STATE_CHANGED_EVENT_TYPE,
  gameEventSchema,
} from "@/schemas/redis/gameStateEvent"

export class GameStateEvents {
  constructor(
    protected readonly gameId: string,
    protected readonly applySnapshot: (snapshot: unknown) => void
  ) {}

  handle(event: MessageEvent) {
    let payload: unknown
    try {
      payload = JSON.parse(event.data)
    } catch {
      return
    }

    if (
      typeof payload === "object" &&
      payload !== null &&
      "type" in payload &&
      typeof payload.type === "string" &&
      payload.type !== GAME_STATE_CHANGED_EVENT_TYPE
    ) {
      return
    }

    const parsed = gameEventSchema.safeParse(payload)
    if (
      parsed.success &&
      parsed.data.type === GAME_STATE_CHANGED_EVENT_TYPE &&
      parsed.data.data.gameId === this.gameId
    ) {
      this.applySnapshot(parsed.data.data)
    }
  }
}
