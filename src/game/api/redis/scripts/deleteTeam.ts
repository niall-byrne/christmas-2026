import "server-only"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { planPlayerRemovals } from "@/game/api/redis/scripts/planPlayerRemovals"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const deleteTeamScript = `
  ${gameMutationValidation}
  ${planPlayerRemovals}

  local gameKey = KEYS[1]
  local teamsKey = KEYS[2]
  local teamNamesKey = KEYS[3]
  local teamColorsKey = KEYS[4]
  local teamKey = KEYS[5]
  local teamPlayersKey = KEYS[6]
  local gamePlayersKey = gameKey .. ":players"
  local playerNamesKey = KEYS[7]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end
  if redis.call("HGET", gameKey, "level") ~= "0" then
    return { "${ApiErrorCode.GAME_NOT_IN_LOBBY}" }
  end
  if redis.call("EXISTS", teamKey) == 0 then
    return { "${ApiErrorCode.TEAM_NOT_FOUND}" }
  end
  if not keyHasType(gameKey, "hash")
    or not keyHasType(teamsKey, "set")
    or not keyHasType(teamNamesKey, "set")
    or not keyHasType(teamColorsKey, "set")
    or not keyHasType(teamKey, "hash")
    or not keyHasType(teamPlayersKey, "set")
    or not keyHasType(gamePlayersKey, "set")
    or not keyHasType(playerNamesKey, "set")
    or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end

  local playerPlan = planPlayerRemovals(
    gameKey,
    gamePlayersKey,
    playerNamesKey,
    nil,
    nil,
    nil,
    false
  )
  if playerPlan.err then
    return playerPlan
  end

  local teamName = redis.call("HGET", teamKey, "name")
  local teamColor = redis.call("HGET", teamKey, "color")
  local normalizedName = ARGV[1]
  local normalizedColor = ARGV[2]
  local teamId = ARGV[3]
  if not teamName or not teamColor
    or normalizedName == ""
    or normalizedColor == ""
    or redis.call("SISMEMBER", teamsKey, teamId) ~= 1
    or redis.call("SISMEMBER", teamNamesKey, normalizedName) ~= 1
    or redis.call("SISMEMBER", teamColorsKey, normalizedColor) ~= 1 then
    return invalidGameState()
  end

  local playerIds = redis.call("SMEMBERS", teamPlayersKey)
  for _, playerId in ipairs(playerIds) do
    local playerKey = KEYS[1] .. ":player:" .. playerId
    if not keyHasType(playerKey, "hash")
      or redis.call("EXISTS", playerKey) == 0
      or redis.call("SISMEMBER", gamePlayersKey, playerId) ~= 1
      or redis.call("HGET", playerKey, "team_id") ~= teamId then
      return invalidGameState()
    end
  end

  for _, playerId in ipairs(playerIds) do
    local playerKey = KEYS[1] .. ":player:" .. playerId
    redis.call("HDEL", playerKey, "team_id")
    redis.call("HSET", playerKey, "ready", "0")
  end

  redis.call("SREM", teamsKey, teamId)
  redis.call("SREM", teamNamesKey, normalizedName)
  redis.call("SREM", teamColorsKey, normalizedColor)
  redis.call("DEL", teamKey, teamPlayersKey)
  redis.call("HINCRBY", gameKey, "revision", 1)
  return { "${GAME_SCRIPT_RESULT.SUCCESS}" }
`
