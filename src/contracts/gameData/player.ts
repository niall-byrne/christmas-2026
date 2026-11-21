export interface PlayerState {
  playerId: string
  name: string
  ready: boolean
}

// POST /api/v1/games/[gameId]/teams/[teamId]/players
export interface AddPlayerRequest {
  name: string
}

export interface AddPlayerResponse {
  playerId: string
  name: string
}

// DELETE /api/v1/games/[gameId]/teams/[teamId]/players/[playerId]
export interface RemovePlayerResponse {
  message: string
}
