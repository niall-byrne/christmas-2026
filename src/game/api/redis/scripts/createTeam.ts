import "server-only"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const createTeamScript = `
  ${gameMutationValidation}

  local gameKey = KEYS[1]
  local gameMembersKey = KEYS[2]
  local teamNamesKey = KEYS[3]
  local teamColorsKey = KEYS[4]
  local teamKey = KEYS[5]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  if not keyHasType(gameKey, "hash")
    or not keyHasType(gameMembersKey, "set")
    or not keyHasType(teamNamesKey, "set")
    or not keyHasType(teamColorsKey, "set")
    or not keyHasType(teamKey, "hash")
    or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end

  local normalizedName = ARGV[1]
  local normalizedColour = ARGV[2]
  local teamId = ARGV[3]
  local teamName = ARGV[4]
  local teamColor = ARGV[5]
  local score = ARGV[6]

  if redis.call("SISMEMBER", teamNamesKey, normalizedName) == 1 then
    return { "${ApiErrorCode.TEAM_NAME_NOT_AVAILABLE}" }
  end

  if redis.call("SISMEMBER", teamColorsKey, normalizedColour) == 1 then
    return { "${ApiErrorCode.TEAM_COLOUR_NOT_AVAILABLE}" }
  end

  redis.call("HSET", teamKey, "name", teamName, "color", teamColor, "score", score)
  redis.call("SADD", gameMembersKey, teamId)
  redis.call("SADD", teamNamesKey, normalizedName)
  redis.call("SADD", teamColorsKey, normalizedColour)
  redis.call("HINCRBY", gameKey, "revision", 1)

  return { "${GAME_SCRIPT_RESULT.SUCCESS}", teamId }
`
