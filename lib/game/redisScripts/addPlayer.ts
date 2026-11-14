import "server-only"
import { ApiErrorCode } from "@/contracts/gameData"

export const addPlayerScript = `
  local gameKey = KEYS[1]
  local teamKey = KEYS[2]
  local teamPlayersKey = KEYS[3]
  local cardsKey = KEYS[4]
  local playerNamesKey = KEYS[5]
  local gamePlayersKey = KEYS[6]
  local playerKey = KEYS[7]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  if redis.call("EXISTS", teamKey) == 0 then
    return { "${ApiErrorCode.TEAM_NOT_FOUND}" }
  end

  local normalizedName = ARGV[1]
  local cardJson = redis.call("HGET", cardsKey, normalizedName)
  if not cardJson then
    return { "${ApiErrorCode.RECIPIENT_NOT_FOUND}" }
  end

  if redis.call("SISMEMBER", playerNamesKey, normalizedName) == 1 then
    return { "${ApiErrorCode.NAME_NOT_AVAILABLE}" }
  end

  if redis.call("SCARD", teamPlayersKey) >= 2 then
    return { "${ApiErrorCode.TEAM_FULL}" }
  end

  local payload = cjson.decode(cardJson)
  local playerId = ARGV[2]
  local playerName = payload["recipient"]
  local ready = "0"

  redis.call("HSET", playerKey, "name", playerName, "ready", ready)
  redis.call("SADD", teamPlayersKey, playerId)
  redis.call("SADD", gamePlayersKey, playerId)
  redis.call("SADD", playerNamesKey, normalizedName)
  redis.call("HINCRBY", gameKey, "revision", 1)

  return { "OK", playerId, playerName, ready }
`
