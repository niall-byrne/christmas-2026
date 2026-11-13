export interface PlayerState {
  playerId: string
  name: string
  ready: boolean
}

// POST /api/games/[gameId]/teams/[teamId]/players
export interface AddPlayerRequest {
  name: string
}

export interface AddPlayerResponse {
  playerId: string
  name: string
}

// DELETE /api/games/[gameId]/teams/[teamId]/players/[playerId]
export interface RemovePlayerResponse {
  message: string
}
