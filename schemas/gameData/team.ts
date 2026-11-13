import { z } from "zod"
import { GameIdSchema, TeamIdSchema } from "@/schemas/gameData/common"

export const TeamNameSchema = z
  .string({ error: "INVALID_TEAM_NAME" })
  .trim()
  .min(1, "INVALID_TEAM_NAME")
  .max(80, "INVALID_TEAM_NAME")

export const TeamColorSchema = z
  .string({ error: "INVALID_TEAM_COLOUR" })
  .trim()
  .min(1, "INVALID_TEAM_COLOUR")
  .max(32, "INVALID_TEAM_COLOUR")

export const ScoreDeltaSchema = z
  .number({ error: "INVALID_SCORE_DELTA" })
  .int("INVALID_SCORE_DELTA")

export const CreateTeamBodySchema = z.object({
  name: TeamNameSchema,
  color: TeamColorSchema,
})

export const UpdateTeamScoreBodySchema = z.object({
  delta: ScoreDeltaSchema,
})

export const TeamParamsSchema = z.object({
  gameId: GameIdSchema,
  teamId: TeamIdSchema,
})

export const TeamHashSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().min(1).max(32),
  score: z.coerce.number().int(),
})

export type TeamHash = z.infer<typeof TeamHashSchema>
