import { z } from "zod"
import { ApiErrorCode } from "@/contracts/gameData"
import { GameIdSchema, TeamIdSchema } from "@/schemas/gameData/common"

export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/

export const TeamNameSchema = z
  .string({ error: ApiErrorCode.INVALID_TEAM_NAME })
  .trim()
  .min(1, ApiErrorCode.INVALID_TEAM_NAME)
  .max(80, ApiErrorCode.INVALID_TEAM_NAME)

export const TeamColorSchema = z
  .string({ error: ApiErrorCode.INVALID_TEAM_COLOUR })
  .trim()
  .regex(HEX_COLOR_REGEX, ApiErrorCode.INVALID_TEAM_COLOUR)
  .transform((val) => val.toLowerCase())

export const ScoreDeltaSchema = z
  .number({ error: ApiErrorCode.INVALID_SCORE_DELTA })
  .int(ApiErrorCode.INVALID_SCORE_DELTA)

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
  color: z.string().regex(HEX_COLOR_REGEX),
  score: z.coerce.number().int(),
})

export type TeamHash = z.infer<typeof TeamHashSchema>
