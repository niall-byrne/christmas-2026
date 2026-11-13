import { z } from "zod"

export const ID_REGEX = /^[a-z0-9]{24}$/

export const GameIdSchema = z
  .string({ error: "INVALID_GAME_ID" })
  .regex(ID_REGEX, "INVALID_GAME_ID")

export const TeamIdSchema = z
  .string({ error: "INVALID_TEAM_ID" })
  .regex(ID_REGEX, "INVALID_TEAM_ID")

export const PlayerIdSchema = z
  .string({ error: "INVALID_PLAYER_ID" })
  .regex(ID_REGEX, "INVALID_PLAYER_ID")
