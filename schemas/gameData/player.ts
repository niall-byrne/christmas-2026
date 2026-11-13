import { z } from "zod"
import {
  GameIdSchema,
  TeamIdSchema,
  PlayerIdSchema,
} from "@/schemas/gameData/common"

export const PlayerNameSchema = z
  .string({ error: "INVALID_PLAYER_NAME" })
  .trim()
  .min(1, "INVALID_PLAYER_NAME")
  .max(80, "INVALID_PLAYER_NAME")

export const AddPlayerBodySchema = z.object({
  name: PlayerNameSchema,
})

export const PlayerParamsSchema = z.object({
  gameId: GameIdSchema,
  teamId: TeamIdSchema,
  playerId: PlayerIdSchema,
})

export const PlayerHashSchema = z.object({
  name: z.string().min(1).max(80),
  ready: z
    .preprocess(
      (val) => val === "1" || val === "true" || val === true,
      z.boolean()
    )
    .default(false),
})

export type PlayerHash = z.infer<typeof PlayerHashSchema>
