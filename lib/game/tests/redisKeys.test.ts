import { describe, expect, it } from "vitest"
import { redisKeys } from "@/lib/game/redisKeys"

describe("redisKeys", () => {
  const gameId = "a1b2c3d4e5f6g7h8i9j0k1l2"
  const teamId = "z9y8x7w6v5u4t3s2r1q0p9o8"
  const playerId = "m1n2b3v4c5x6z7l8k9j0h1g2"

  it("builds top-level game keys accurately", () => {
    expect(redisKeys.game(gameId)).toBe(`game:${gameId}`)
    expect(redisKeys.cards(gameId)).toBe(`game:${gameId}:cards`)
    expect(redisKeys.teams(gameId)).toBe(`game:${gameId}:teams`)
    expect(redisKeys.teamNames(gameId)).toBe(`game:${gameId}:team_names`)
    expect(redisKeys.teamColors(gameId)).toBe(`game:${gameId}:team_colors`)
    expect(redisKeys.players(gameId)).toBe(`game:${gameId}:players`)
    expect(redisKeys.playerNames(gameId)).toBe(`game:${gameId}:player_names`)
  })

  it("builds nested team and player keys accurately", () => {
    expect(redisKeys.team(gameId, teamId)).toBe(`game:${gameId}:team:${teamId}`)
    expect(redisKeys.teamPlayers(gameId, teamId)).toBe(
      `game:${gameId}:team:${teamId}:players`
    )
    expect(redisKeys.player(gameId, teamId, playerId)).toBe(
      `game:${gameId}:team:${teamId}:player:${playerId}`
    )
  })
})
