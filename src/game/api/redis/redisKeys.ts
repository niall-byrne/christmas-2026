const TEAM_PLAYERS_SUFFIX = ":players"
const PLAYER_KEY_PREFIX_SUFFIX = ":player:"

export const redisKeys = {
  game: (gameId: string) => `game:${gameId}`,
  cards: (gameId: string) => `game:${gameId}:cards`,
  teams: (gameId: string) => `game:${gameId}:teams`,
  teamNames: (gameId: string) => `game:${gameId}:team_names`,
  teamColors: (gameId: string) => `game:${gameId}:team_colors`,
  players: (gameId: string) => `game:${gameId}:players`,
  playerNames: (gameId: string) => `game:${gameId}:player_names`,
  teamPrefix: (gameId: string) => `${redisKeys.game(gameId)}:team:`,
  teamPlayersSuffix: TEAM_PLAYERS_SUFFIX,
  playerKeyPrefixSuffix: PLAYER_KEY_PREFIX_SUFFIX,
  gameExpirationKeys: (gameId: string) => [
    redisKeys.game(gameId),
    redisKeys.cards(gameId),
    redisKeys.teams(gameId),
    redisKeys.teamNames(gameId),
    redisKeys.teamColors(gameId),
    redisKeys.players(gameId),
    redisKeys.playerNames(gameId),
  ],
  team: (gameId: string, teamId: string) =>
    `${redisKeys.teamPrefix(gameId)}${teamId}`,
  teamPlayers: (gameId: string, teamId: string) =>
    `${redisKeys.team(gameId, teamId)}${redisKeys.teamPlayersSuffix}`,
  player: (gameId: string, teamId: string, playerId: string) =>
    `${redisKeys.team(gameId, teamId)}${redisKeys.playerKeyPrefixSuffix}${playerId}`,
} as const
