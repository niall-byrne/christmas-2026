import { z } from "zod"
import { ApiErrorCode } from "@/contracts/gameData"
import { redisLookupKey } from "@/lib/game/redisLookupKey"

export const BonusCardSchema = z
  .string({ error: ApiErrorCode.INVALID_BONUS_CARD })
  .trim()
  .min(1, ApiErrorCode.INVALID_BONUS_CARD)
  .max(80, ApiErrorCode.INVALID_BONUS_CARD)

export const CardStateSchema = z.object(
  {
    recipient: z
      .string({ error: ApiErrorCode.INVALID_GAME_CARDS })
      .trim()
      .min(1, ApiErrorCode.INVALID_GAME_CARDS)
      .max(80, ApiErrorCode.INVALID_GAME_CARDS),
    identifier: z
      .string({ error: ApiErrorCode.INVALID_GAME_CARDS })
      .trim()
      .min(1, ApiErrorCode.INVALID_GAME_CARDS)
      .max(80, ApiErrorCode.INVALID_GAME_CARDS),
  },
  { error: ApiErrorCode.INVALID_GAME_CARDS }
)

export const GameCardsSchema = z
  .array(CardStateSchema, { error: ApiErrorCode.INVALID_GAME_CARDS })
  .min(1, ApiErrorCode.INVALID_GAME_CARDS)
  .refine(
    (cards) => {
      const normalized = cards.map((c) => redisLookupKey(c.recipient))
      return new Set(normalized).size === normalized.length
    },
    { message: ApiErrorCode.INVALID_GAME_CARDS }
  )

const CardHashEntrySchema = z.string().transform((raw, ctx) => {
  try {
    const parsed = CardStateSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message: ApiErrorCode.INVALID_GAME_CARDS,
      })
      return z.NEVER
    }
    return parsed.data
  } catch {
    ctx.addIssue({
      code: "custom",
      message: ApiErrorCode.INVALID_GAME_CARDS,
    })
    return z.NEVER
  }
})

export const GameCardsHashSchema = z.record(
  z.string().min(1).max(80),
  CardHashEntrySchema
)

export type GameCardsHash = z.infer<typeof GameCardsHashSchema>
