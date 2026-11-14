import "server-only"
import { ApiErrorCode } from "@/contracts/gameData"

export const removePlayerScript = `
  local gameKey = KEYS[1]
  local teamKey = KEYS[2]
  local teamPlayersKey = KEYS[3]
  local gamePlayersKey = KEYS[4]
  local playerNamesKey = KEYS[5]
  local playerKey = KEYS[6]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  if redis.call("EXISTS", teamKey) == 0 then
    return { "${ApiErrorCode.TEAM_NOT_FOUND}" }
  end

  if redis.call("EXISTS", playerKey) == 0 then
    return { "${ApiErrorCode.PLAYER_NOT_FOUND}" }
  end

  local playerName = redis.call("HGET", playerKey, "name")
  local playerId = ARGV[1]

  redis.call("SREM", gamePlayersKey, playerId)
  redis.call("SREM", teamPlayersKey, playerId)
  redis.call("SREM", playerNamesKey, ARGV[2])
  redis.call("DEL", playerKey)
  redis.call("HINCRBY", gameKey, "revision", 1)

  return { "OK", playerName }
`
