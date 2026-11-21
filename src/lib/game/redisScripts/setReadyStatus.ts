import "server-only"
import { ApiErrorCode } from "@/contracts/gameData"
import { gameMutationValidation } from "@/lib/game/redisScripts/mutationValidation"
import { GAME_SCRIPT_RESULT } from "@/lib/game/redisScripts/resultCodes"

export const setReadyStatusScript = `
  ${gameMutationValidation}

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

  if not keyHasType(gameKey, "hash")
    or not keyHasType(teamKey, "hash")
    or not keyHasType(playerKey, "hash")
    or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end

  if redis.call("HGET", playerKey, "ready") == readyValue then
    return { "${GAME_SCRIPT_RESULT.NO_OP}", readyValue }
  end

  redis.call("HSET", playerKey, "ready", readyValue)
  redis.call("HINCRBY", gameKey, "revision", 1)
  return { "${GAME_SCRIPT_RESULT.SUCCESS}", readyValue }
`
