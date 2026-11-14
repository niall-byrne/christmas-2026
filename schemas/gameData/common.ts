import { z } from "zod"
import { ApiErrorCode } from "@/contracts/gameData"

export const ID_REGEX = /^[a-z0-9]{24}$/

export const GameIdSchema = z
  .string({ error: ApiErrorCode.INVALID_GAME_ID })
  .regex(ID_REGEX, ApiErrorCode.INVALID_GAME_ID)

export const TeamIdSchema = z
  .string({ error: ApiErrorCode.INVALID_TEAM_ID })
  .regex(ID_REGEX, ApiErrorCode.INVALID_TEAM_ID)

export const PlayerIdSchema = z
  .string({ error: ApiErrorCode.INVALID_PLAYER_ID })
  .regex(ID_REGEX, ApiErrorCode.INVALID_PLAYER_ID)
