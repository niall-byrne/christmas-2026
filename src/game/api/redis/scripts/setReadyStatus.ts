import "server-only"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const setReadyStatusScript = `
  ${gameMutationValidation}

  local gameKey = KEYS[1]
  local playerKey = KEYS[2]
  local teamsKey = KEYS[3]
  local gamePlayersKey = gameKey .. ":players"
  local readyValue = ARGV[1]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  if redis.call("HGET", gameKey, "level") ~= "0" then
    return { "${ApiErrorCode.GAME_NOT_IN_LOBBY}" }
  end

  if redis.call("EXISTS", playerKey) == 0 then
    return { "${ApiErrorCode.PLAYER_NOT_FOUND}" }
  end

  if not redis.call("HGET", playerKey, "team_id") then
    return { "${ApiErrorCode.PLAYER_NOT_ASSIGNED}" }
  end

  if not keyHasType(gameKey, "hash")
    or not keyHasType(playerKey, "hash")
    or not keyHasType(teamsKey, "set")
    or not keyHasType(gamePlayersKey, "set")
    or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end

  local playerId = string.match(playerKey, ":player:([^:]+)$")
  local teamId = redis.call("HGET", playerKey, "team_id")
  local teamKey = gameKey .. ":team:" .. teamId
  local teamPlayersKey = gameKey .. ":team:" .. teamId .. ":players"
  if not playerId
    or redis.call("SISMEMBER", teamsKey, teamId) ~= 1
    or redis.call("SISMEMBER", gamePlayersKey, playerId) ~= 1
    or not keyHasType(teamKey, "hash")
    or redis.call("EXISTS", teamKey) == 0
    or not keyHasType(teamPlayersKey, "set")
    or redis.call("SISMEMBER", teamPlayersKey, playerId) ~= 1 then
    return invalidGameState()
  end

  if redis.call("HGET", playerKey, "ready") == readyValue then
    return { "${GAME_SCRIPT_RESULT.NO_OP}", readyValue }
  end

  redis.call("HSET", playerKey, "ready", readyValue)
  redis.call("HINCRBY", gameKey, "revision", 1)
  return { "${GAME_SCRIPT_RESULT.SUCCESS}", readyValue }
`
