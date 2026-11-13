export const redisKeys = {
  game: (gameId: string) => `game:${gameId}`,
  cards: (gameId: string) => `game:${gameId}:cards`,
  teams: (gameId: string) => `game:${gameId}:teams`,
  teamNames: (gameId: string) => `game:${gameId}:team_names`,
  teamColors: (gameId: string) => `game:${gameId}:team_colors`,
  players: (gameId: string) => `game:${gameId}:players`,
  playerNames: (gameId: string) => `game:${gameId}:player_names`,
  team: (gameId: string, teamId: string) => `game:${gameId}:team:${teamId}`,
  teamPlayers: (gameId: string, teamId: string) =>
    `game:${gameId}:team:${teamId}:players`,
  player: (gameId: string, teamId: string, playerId: string) =>
    `game:${gameId}:team:${teamId}:player:${playerId}`,
} as const
