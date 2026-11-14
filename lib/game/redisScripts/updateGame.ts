import "server-only"
import { ApiErrorCode } from "@/contracts/gameData"

export const updateGameScript = `
  local gameKey = KEYS[1]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  local name = ARGV[1]
  local level = ARGV[2]

  if name ~= "" then
    redis.call("HSET", gameKey, "name", name)
  end

  if level ~= "" then
    redis.call("HSET", gameKey, "level", level)
  end

  local revision = redis.call("HINCRBY", gameKey, "revision", 1)
  return { "OK", revision }
`
