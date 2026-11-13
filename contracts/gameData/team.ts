import type { PlayerState } from "@/contracts/gameData/player"

export interface TeamState {
  teamId: string
  name: string
  color: string
  score: number
  players: PlayerState[]
}

// POST /api/games/[gameId]/teams
export interface CreateTeamRequest {
  name: string
  color: string
}

export interface CreateTeamResponse {
  teamId: string
  name: string
  color: string
  score: number
}

// PATCH /api/games/[gameId]/teams/[teamId]/score
export interface UpdateTeamScoreRequest {
  delta: number
}

export interface UpdateTeamScoreResponse {
  teamId: string
  score: number
}
