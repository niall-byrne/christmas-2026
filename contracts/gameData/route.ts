export interface GameRouteParams {
  gameId: string
}

export interface TeamRouteParams {
  gameId: string
  teamId: string
}

export interface PlayerRouteParams {
  gameId: string
  teamId: string
  playerId: string
}
