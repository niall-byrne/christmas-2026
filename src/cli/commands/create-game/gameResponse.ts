import { GameIdSchema } from "@/schemas/game/api/data/common"
import { CreateGameResponseError } from "@/cli/commands/create-game/error"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function parseCreatedGameId(
  payload: unknown,
  responseField = "gameId"
): string {
  const gameId = isRecord(payload) ? payload[responseField] : undefined
  if (typeof gameId !== "string") {
    throw CreateGameResponseError.missingGameId()
  }

  const parsed = GameIdSchema.safeParse(gameId)
  if (!parsed.success) {
    throw CreateGameResponseError.invalidGameId()
  }
  return parsed.data
}
