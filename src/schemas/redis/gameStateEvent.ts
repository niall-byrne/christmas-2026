import { z } from "zod"
import { GetGameResponseSchema } from "@/schemas/gameData/game"

export const GAME_STATE_CHANGED_EVENT_TYPE = "game.state.changed" as const

export const gameStateChangedEventSchema = z.object({
  type: z.literal(GAME_STATE_CHANGED_EVENT_TYPE),
  data: GetGameResponseSchema,
})

export const gameEventSchema = z.discriminatedUnion("type", [
  gameStateChangedEventSchema,
])

export type GameStateChangedEvent = z.infer<typeof gameStateChangedEventSchema>
