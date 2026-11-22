export interface PlayerState {
  playerId: string
  name: string
  ready: boolean
}

export interface UnassignedPlayerState {
  playerId: string
  name: string
  ready: false
}

// POST /api/v1/games/[gameId]/players
export interface ClaimPlayerRequest {
  name: string
}

export interface ClaimPlayerResponse {
  playerId: string
  name: string
  teamId: string | null
}

// POST /api/v1/games/[gameId]/teams/[teamId]/players
export interface AssignPlayerResponse {
  playerId: string
  name: string
  teamId: string
  ready: boolean
}

// DELETE /api/v1/games/[gameId]/players
export interface RemovePlayerResponse {
  message: string
}
