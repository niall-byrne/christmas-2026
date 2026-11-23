import "server-only"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const leaveTeamScript = `
  ${gameMutationValidation}

  local gameKey = KEYS[1]
  local teamKey = KEYS[2]
  local teamPlayersKey = KEYS[3]
  local playerKey = KEYS[4]
  local teamsKey = KEYS[5]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end
  if redis.call("HGET", gameKey, "level") ~= "0" then
    return { "${ApiErrorCode.GAME_NOT_IN_LOBBY}" }
  end
  if redis.call("EXISTS", teamKey) == 0 then
    return { "${ApiErrorCode.TEAM_NOT_FOUND}" }
  end
  if redis.call("EXISTS", playerKey) == 0 then
    return { "${ApiErrorCode.PLAYER_NOT_FOUND}" }
  end
  if not keyHasType(gameKey, "hash")
    or not keyHasType(teamKey, "hash")
    or not keyHasType(teamPlayersKey, "set")
    or not keyHasType(playerKey, "hash")
    or not keyHasType(teamsKey, "set")
    or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end

  local playerId = ARGV[1]
  if redis.call("SISMEMBER", teamsKey, ARGV[2]) ~= 1 then
    return { "${ApiErrorCode.TEAM_NOT_FOUND}" }
  end
  if redis.call("SISMEMBER", gameKey .. ":players", playerId) ~= 1 then
    return { "${ApiErrorCode.PLAYER_NOT_FOUND}" }
  end

  local currentTeamId = redis.call("HGET", playerKey, "team_id")
  local playerName = redis.call("HGET", playerKey, "name")
  local ready = redis.call("HGET", playerKey, "ready") or "0"
  if currentTeamId ~= ARGV[2] then
    return {
      "${GAME_SCRIPT_RESULT.NO_OP}",
      playerName or "",
      currentTeamId or "",
      ready
    }
  end

  if redis.call("SISMEMBER", teamPlayersKey, playerId) ~= 1
    or not playerName then
    return invalidGameState()
  end

  redis.call("SREM", teamPlayersKey, playerId)
  redis.call("HDEL", playerKey, "team_id")
  redis.call("HSET", playerKey, "ready", "0")
  redis.call("HINCRBY", gameKey, "revision", 1)
  return { "${GAME_SCRIPT_RESULT.SUCCESS}", playerName or "", "", "0" }
`
