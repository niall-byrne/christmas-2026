import type { TeamState } from "@/contracts/gameData/team"

// POST /api/games
export interface CreateGameRequest {
  name: string
}

export interface CreateGameResponse {
  gameId: string
  name: string
  level: number
}

// GET /api/games/[gameId]
export interface GetGameResponse {
  gameId: string
  name: string
  level: number
  createdAt: string
  teams: TeamState[]
}

// PATCH /api/games/[gameId]
export interface UpdateGameRequest {
  level?: number
  name?: string
}

export interface UpdateGameResponse {
  gameId: string
  name: string
  level: number
  createdAt: string
}
