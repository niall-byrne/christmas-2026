import { z } from "zod"
import { ApiErrorCode } from "@/contracts/game/api/data"
import {
  GAME_COMPLETE_LEVEL,
  GAME_LOBBY_LEVEL,
  type ActiveGameLevel,
  type GetGameResponse,
} from "@/contracts/game/api/data/game"
import {
  BonusCardSchema,
  CardStateSchema,
  GameCardsSchema,
} from "@/schemas/game/api/data/card"
import {
  GameIdSchema,
  PlayerIdSchema,
  TeamIdSchema,
} from "@/schemas/game/api/data/common"
import { PlayerNameSchema } from "@/schemas/game/api/data/player"
import { TeamColorSchema, TeamNameSchema } from "@/schemas/game/api/data/team"

export const GameNameSchema = z
  .string({ error: ApiErrorCode.INVALID_GAME_NAME })
  .trim()
  .min(1, ApiErrorCode.INVALID_GAME_NAME)
  .max(80, ApiErrorCode.INVALID_GAME_NAME)

export const GameLevelSchema = z
  .number({ error: ApiErrorCode.INVALID_LEVEL })
  .int(ApiErrorCode.INVALID_LEVEL)
  .min(GAME_LOBBY_LEVEL, ApiErrorCode.INVALID_LEVEL)
  .max(GAME_COMPLETE_LEVEL, ApiErrorCode.INVALID_LEVEL)

const ActiveGameLevelSchema = z
  .number({ error: ApiErrorCode.INVALID_LEVEL })
  .int(ApiErrorCode.INVALID_LEVEL)
  .min(GAME_LOBBY_LEVEL, ApiErrorCode.INVALID_LEVEL)
  .refine((level): level is ActiveGameLevel => level < GAME_COMPLETE_LEVEL, {
    message: ApiErrorCode.INVALID_LEVEL,
  })

export const GamePasswordSchema = z
  .string({ error: ApiErrorCode.INVALID_GAME_PASSWORD })
  .trim()
  .min(1, ApiErrorCode.INVALID_GAME_PASSWORD)
  .max(128, ApiErrorCode.INVALID_GAME_PASSWORD)

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
    message: ApiErrorCode.INVALID_LEVEL,
  })

export const GameParamsSchema = z.object({
  gameId: GameIdSchema,
})

export const GameHashSchema = z.object({
  level: z.coerce.number().int().min(GAME_LOBBY_LEVEL).max(GAME_COMPLETE_LEVEL),
  revision: z.coerce.number().int().min(1),
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
  revision: z.number().int().min(1),
  createdAt: z.string(),
  recipients: z.array(PlayerNameSchema),
  teams: z.array(TeamStateSchema),
  unassignedPlayers: z.array(
    z.object({
      playerId: PlayerIdSchema,
      name: PlayerNameSchema,
      ready: z.literal(false),
    })
  ),
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
