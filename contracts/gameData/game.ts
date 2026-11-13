import type { CardState } from "@/contracts/gameData/card"
import type { TeamState } from "@/contracts/gameData/team"

type LessThan<
  N extends number,
  Acc extends unknown[] = [],
> = Acc["length"] extends N ? Acc[number] : LessThan<N, [...Acc, Acc["length"]]>

export const GAME_LOBBY_LEVEL = 0 as const
export const GAME_COMPLETE_LEVEL = 5 as const

export type ActiveGameLevel = LessThan<typeof GAME_COMPLETE_LEVEL>
export type CompletedGameLevel = typeof GAME_COMPLETE_LEVEL
export type GameLevel = ActiveGameLevel | CompletedGameLevel

// POST /api/games
export interface CreateGameRequest {
  name: string
  password: string
  bonusCard: string
  cards: CardState[]
}

export interface CreateGameResponse {
  gameId: string
  name: string
  level: GameLevel
}

// GET /api/games/[gameId]
interface BaseGameResponse {
  gameId: string
  name: string
  createdAt: string
  recipients: string[]
  teams: TeamState[]
}

export type GetGameResponse =
  | (BaseGameResponse & {
      level: ActiveGameLevel
    })
  | (BaseGameResponse & {
      level: CompletedGameLevel
      bonusCard: string
      cards: CardState[]
    })

// POST /api/games/[gameId]/join
export interface JoinGameRequest {
  password: string
}

export interface JoinGameResponse {
  gameId: string
}

// PATCH /api/games/[gameId]
export interface UpdateGameRequest {
  level?: GameLevel
  name?: string
}

export interface UpdateGameResponse {
  gameId: string
  name: string
  level: GameLevel
  createdAt: string
}
