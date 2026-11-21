import "server-only"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const updateTeamScoreScript = `
  ${gameMutationValidation}

  local gameKey = KEYS[1]
  local teamKey = KEYS[2]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  if redis.call("EXISTS", teamKey) == 0 then
    return { "${ApiErrorCode.TEAM_NOT_FOUND}" }
  end

  if not keyHasType(gameKey, "hash")
    or not keyHasType(teamKey, "hash")
    or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end

  local delta = tonumber(ARGV[1])
  local currentScore = redis.call("HGET", teamKey, "score")
  if delta == 0 and currentScore and tonumber(currentScore) then
    return { "${GAME_SCRIPT_RESULT.NO_OP}", currentScore }
  end

  local score = redis.call("HINCRBY", teamKey, "score", ARGV[1])
  redis.call("HINCRBY", gameKey, "revision", 1)

  return { "${GAME_SCRIPT_RESULT.SUCCESS}", score }
`
