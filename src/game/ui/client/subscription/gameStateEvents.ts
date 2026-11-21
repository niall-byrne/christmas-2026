import {
  GAME_STATE_CHANGED_EVENT_TYPE,
  gameEventSchema,
} from "@/schemas/game/redis/gameStateEvent"
import {
  type GameClientEndpointLogger,
  gameClientLogger,
} from "@/game/ui/client/logger"

export class GameStateEvents {
  constructor(
    protected readonly gameId: string,
    protected readonly applySnapshot: (snapshot: unknown) => void,
    protected readonly logger: GameClientEndpointLogger = gameClientLogger
  ) {}

  handle(event: MessageEvent) {
    let payload: unknown
    try {
      payload = JSON.parse(event.data)
    } catch (error) {
      this.logger.warn("Ignoring malformed SSE JSON", {
        component: "GameStateEvents",
        gameId: this.gameId,
        dataLength: event.data.length,
        errorName:
          error instanceof SyntaxError ? "SyntaxError" : "UnknownError",
      })
      return
    }

    const eventType =
      typeof payload === "object" &&
      payload !== null &&
      "type" in payload &&
      typeof payload.type === "string"
        ? payload.type
        : undefined

    if (
      typeof payload === "object" &&
      payload !== null &&
      "type" in payload &&
      typeof payload.type === "string" &&
      payload.type !== GAME_STATE_CHANGED_EVENT_TYPE
    ) {
      this.logger.info("Ignoring unsupported SSE event", {
        component: "GameStateEvents",
        gameId: this.gameId,
        eventType: payload.type,
      })
      return
    }

    const parsed = gameEventSchema.safeParse(payload)
    if (!parsed.success) {
      this.logger.warn("Ignoring invalid SSE event", {
        component: "GameStateEvents",
        gameId: this.gameId,
        eventType,
        issues: parsed.error.issues.map(({ code, path, message }) => ({
          code,
          path,
          message,
        })),
      })
      return
    }

    if (parsed.data.type !== GAME_STATE_CHANGED_EVENT_TYPE) return

    if (parsed.data.data.gameId !== this.gameId) {
      this.logger.warn("Ignoring event for another game", {
        component: "GameStateEvents",
        gameId: this.gameId,
        eventGameId: parsed.data.data.gameId,
        revision: parsed.data.data.revision,
      })
      return
    }

    this.logger.info("Applying game state event", {
      component: "GameStateEvents",
      gameId: this.gameId,
      revision: parsed.data.data.revision,
    })
    this.applySnapshot(parsed.data.data)
  }
}
