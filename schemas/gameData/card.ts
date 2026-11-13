import { z } from "zod"
import { redisLookupKey } from "@/lib/game/redisLookupKey"

export const BonusCardSchema = z
  .string({ error: "INVALID_BONUS_CARD" })
  .trim()
  .min(1, "INVALID_BONUS_CARD")
  .max(80, "INVALID_BONUS_CARD")

export const CardStateSchema = z.object(
  {
    recipient: z
      .string({ error: "INVALID_GAME_CARDS" })
      .trim()
      .min(1, "INVALID_GAME_CARDS")
      .max(80, "INVALID_GAME_CARDS"),
    identifier: z
      .string({ error: "INVALID_GAME_CARDS" })
      .trim()
      .min(1, "INVALID_GAME_CARDS")
      .max(80, "INVALID_GAME_CARDS"),
  },
  { error: "INVALID_GAME_CARDS" }
)

export const GameCardsSchema = z
  .array(CardStateSchema, { error: "INVALID_GAME_CARDS" })
  .min(1, "INVALID_GAME_CARDS")
  .refine(
    (cards) => {
      const normalized = cards.map((c) => redisLookupKey(c.recipient))
      return new Set(normalized).size === normalized.length
    },
    { message: "INVALID_GAME_CARDS" }
  )

const CardHashEntrySchema = z.string().transform((raw, ctx) => {
  try {
    const parsed = CardStateSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "INVALID_GAME_CARDS" })
      return z.NEVER
    }
    return parsed.data
  } catch {
    ctx.addIssue({ code: "custom", message: "INVALID_GAME_CARDS" })
    return z.NEVER
  }
})

export const GameCardsHashSchema = z.record(
  z.string().min(1).max(80),
  CardHashEntrySchema
)

export type GameCardsHash = z.infer<typeof GameCardsHashSchema>
