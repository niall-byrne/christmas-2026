import "server-only"
import { ApiErrorCode } from "@/contracts/gameData"

export const updateTeamScoreScript = `
  local gameKey = KEYS[1]
  local teamKey = KEYS[2]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  if redis.call("EXISTS", teamKey) == 0 then
    return { "${ApiErrorCode.TEAM_NOT_FOUND}" }
  end

  local score = redis.call("HINCRBY", teamKey, "score", ARGV[1])
  redis.call("HINCRBY", gameKey, "revision", 1)

  return { "OK", score }
`
