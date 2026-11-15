import { z } from "zod"
import { GetGameResponseSchema } from "@/schemas/gameData/game"

export const gameStateChangedEventSchema = z.object({
  type: z.literal("game.state.changed"),
  data: GetGameResponseSchema,
})

export const gameEventSchema = z.discriminatedUnion("type", [
  gameStateChangedEventSchema,
])

export type GameStateChangedEvent = z.infer<typeof gameStateChangedEventSchema>
