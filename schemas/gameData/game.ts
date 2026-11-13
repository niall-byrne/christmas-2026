import { z } from "zod"
import { GameIdSchema } from "@/schemas/gameData/common"

export const GameNameSchema = z
  .string({ error: "INVALID_GAME_NAME" })
  .trim()
  .min(1, "INVALID_GAME_NAME")
  .max(80, "INVALID_GAME_NAME")

export const GameLevelSchema = z
  .number({ error: "INVALID_LEVEL" })
  .int("INVALID_LEVEL")
  .min(0, "INVALID_LEVEL")
  .max(5, "INVALID_LEVEL")

export const CreateGameBodySchema = z.object({
  name: GameNameSchema,
})

export const UpdateGameBodySchema = z
  .object({
    level: GameLevelSchema.optional(),
    name: GameNameSchema.optional(),
  })
  .refine((data) => data.level !== undefined || data.name !== undefined, {
    message: "INVALID_LEVEL",
  })

export const GameParamsSchema = z.object({
  gameId: GameIdSchema,
})

export const GameHashSchema = z.object({
  level: z.coerce.number().int().min(0).max(5),
  created_at: z.string(),
  name: z.string().min(1).max(80),
})

export type GameHash = z.infer<typeof GameHashSchema>
