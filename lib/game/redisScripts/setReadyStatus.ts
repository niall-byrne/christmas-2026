import "server-only"
import { ApiErrorCode } from "@/contracts/gameData"

export const setReadyStatusScript = `
  local gameKey = KEYS[1]
  local teamKey = KEYS[2]
  local playerKey = KEYS[3]
  local readyValue = ARGV[1]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  if redis.call("EXISTS", teamKey) == 0 then
    return { "${ApiErrorCode.TEAM_NOT_FOUND}" }
  end

  if redis.call("EXISTS", playerKey) == 0 then
    return { "${ApiErrorCode.PLAYER_NOT_FOUND}" }
  end

  redis.call("HSET", playerKey, "ready", readyValue)
  redis.call("HINCRBY", gameKey, "revision", 1)
  return { "OK", readyValue }
`
