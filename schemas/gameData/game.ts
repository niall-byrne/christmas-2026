import { z } from "zod"
import {
  GAME_COMPLETE_LEVEL,
  GAME_LOBBY_LEVEL,
  type ActiveGameLevel,
  type GetGameResponse,
} from "@/contracts/gameData/game"
import {
  BonusCardSchema,
  CardStateSchema,
  GameCardsSchema,
} from "@/schemas/gameData/card"
import {
  GameIdSchema,
  PlayerIdSchema,
  TeamIdSchema,
} from "@/schemas/gameData/common"
import { PlayerNameSchema } from "@/schemas/gameData/player"
import { TeamColorSchema, TeamNameSchema } from "@/schemas/gameData/team"

export const GameNameSchema = z
  .string({ error: "INVALID_GAME_NAME" })
  .trim()
  .min(1, "INVALID_GAME_NAME")
  .max(80, "INVALID_GAME_NAME")

export const GameLevelSchema = z
  .number({ error: "INVALID_LEVEL" })
  .int("INVALID_LEVEL")
  .min(GAME_LOBBY_LEVEL, "INVALID_LEVEL")
  .max(GAME_COMPLETE_LEVEL, "INVALID_LEVEL")

const ActiveGameLevelSchema = z
  .number({ error: "INVALID_LEVEL" })
  .int("INVALID_LEVEL")
  .min(GAME_LOBBY_LEVEL, "INVALID_LEVEL")
  .refine((level): level is ActiveGameLevel => level < GAME_COMPLETE_LEVEL, {
    message: "INVALID_LEVEL",
  })

export const GamePasswordSchema = z
  .string({ error: "INVALID_GAME_PASSWORD" })
  .trim()
  .min(1, "INVALID_GAME_PASSWORD")
  .max(128, "INVALID_GAME_PASSWORD")

export const CreateGameBodySchema = z.object({
  name: GameNameSchema,
  password: GamePasswordSchema,
  bonusCard: BonusCardSchema,
  cards: GameCardsSchema,
})

export const JoinGameBodySchema = z.object({
  password: GamePasswordSchema,
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
  level: z.coerce.number().int().min(GAME_LOBBY_LEVEL).max(GAME_COMPLETE_LEVEL),
  created_at: z.string(),
  name: z.string().min(1).max(80),
  password_hash: z.string().min(1),
  bonus_card: z.string().min(1).max(80),
})

const TeamStateSchema = z.object({
  teamId: TeamIdSchema,
  name: TeamNameSchema,
  color: TeamColorSchema,
  score: z.number().int(),
  players: z.array(
    z.object({
      playerId: PlayerIdSchema,
      name: PlayerNameSchema,
      ready: z.boolean(),
    })
  ),
})

const BaseGameResponseSchema = z.object({
  gameId: GameIdSchema,
  name: GameNameSchema,
  createdAt: z.string(),
  recipients: z.array(PlayerNameSchema),
  teams: z.array(TeamStateSchema),
})

export const GetGameResponseSchema: z.ZodType<GetGameResponse> = z.union([
  BaseGameResponseSchema.extend({
    level: ActiveGameLevelSchema,
  }),
  BaseGameResponseSchema.extend({
    level: z.literal(GAME_COMPLETE_LEVEL),
    bonusCard: BonusCardSchema,
    cards: z.array(CardStateSchema),
  }),
])

export type GameHash = z.infer<typeof GameHashSchema>
