import "server-only"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const readGameSnapshotScript = `
  local gameHash = redis.call("HGETALL", KEYS[1])
  if #gameHash == 0 then
    return { "${GAME_SCRIPT_RESULT.NOT_FOUND}" }
  end

  local cardsHash = redis.call("HGETALL", KEYS[2])
  local teamIds = redis.call("SMEMBERS", KEYS[3])
  local gamePlayerIds = redis.call("SMEMBERS", KEYS[4])
  local teams = {}
  local teamPrefix = KEYS[1] .. ":team:"

  for _, teamId in ipairs(teamIds) do
    local teamKey = teamPrefix .. teamId
    local teamHash = redis.call("HGETALL", teamKey)
    local playerIds = redis.call("SMEMBERS", teamKey .. ":players")
    local players = {}

    for _, playerId in ipairs(playerIds) do
      local playerHash = redis.call("HGETALL", KEYS[1] .. ":player:" .. playerId)
      table.insert(players, { playerId, playerHash })
    end

    table.insert(teams, { teamId, teamHash, players })
  end

  local unassigned = {}
  for _, playerId in ipairs(gamePlayerIds) do
    local playerKey = KEYS[1] .. ":player:" .. playerId
    local playerHash = redis.call("HGETALL", playerKey)
    local teamId = redis.call("HGET", playerKey, "team_id")
    if not teamId then
      table.insert(unassigned, { playerId, playerHash })
    end
  end

  return { "${GAME_SCRIPT_RESULT.SUCCESS}", gameHash, cardsHash, teams, unassigned }
`
