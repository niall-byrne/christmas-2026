import "server-only"
import { ApiErrorCode, GAME_COMPLETE_LEVEL } from "@/contracts/gameData"

export const updateGameScript = `
  local gameKey = KEYS[1]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  local name = ARGV[1]
  local level = ARGV[2]
  local ttlSeconds = tonumber(ARGV[3])
  local teamKeyPrefix = ARGV[4]
  local teamPlayersSuffix = ARGV[5]
  local playerKeyPrefixSuffix = ARGV[6]

  if name ~= "" then
    redis.call("HSET", gameKey, "name", name)
  end

  if level ~= "" then
    redis.call("HSET", gameKey, "level", level)
  end

  local revision = redis.call("HINCRBY", gameKey, "revision", 1)

  if level == "${GAME_COMPLETE_LEVEL}" then
    for keyIndex = 1, #KEYS do
      redis.call("EXPIRE", KEYS[keyIndex], ttlSeconds)
    end

    local teamIds = redis.call("SMEMBERS", KEYS[3])
    for _, teamId in ipairs(teamIds) do
      local teamKey = teamKeyPrefix .. teamId
      local teamPlayersKey = teamKey .. teamPlayersSuffix
      redis.call("EXPIRE", teamKey, ttlSeconds)
      redis.call("EXPIRE", teamPlayersKey, ttlSeconds)

      local playerIds = redis.call("SMEMBERS", teamPlayersKey)
      local playerKeyPrefix = teamKey .. playerKeyPrefixSuffix
      for _, playerId in ipairs(playerIds) do
        redis.call("EXPIRE", playerKeyPrefix .. playerId, ttlSeconds)
      end
    end
  end

  return { "OK", revision }
`
