import "server-only"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const assignPlayerScript = `
  ${gameMutationValidation}

  local gameKey = KEYS[1]
  local teamKey = KEYS[2]
  local teamPlayersKey = KEYS[3]
  local playerKey = KEYS[4]
  local gamePlayersKey = KEYS[5]
  local teamsKey = KEYS[6]

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
    or not keyHasType(teamPlayersKey, "set")
    or not keyHasType(playerKey, "hash")
    or not keyHasType(gamePlayersKey, "set")
    or not keyHasType(teamsKey, "set")
    or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end

  local level = redis.call("HGET", gameKey, "level")
  if not level then
    return invalidGameState()
  end
  if tonumber(level) ~= 0 then
    return { "${ApiErrorCode.GAME_NOT_IN_LOBBY}" }
  end

  local playerId = ARGV[1]
  if redis.call("SISMEMBER", teamsKey, ARGV[2]) ~= 1 then
    return { "${ApiErrorCode.TEAM_NOT_FOUND}" }
  end
  if redis.call("SISMEMBER", gamePlayersKey, playerId) ~= 1 then
    return { "${ApiErrorCode.PLAYER_NOT_FOUND}" }
  end

  local destinationPlayerIds = redis.call("SMEMBERS", teamPlayersKey)
  for _, memberId in ipairs(destinationPlayerIds) do
    local memberKey = gameKey .. ":player:" .. memberId
    if string.len(memberId) ~= 24
      or not string.match(memberId, "^[a-f0-9]+$")
      or redis.call("SISMEMBER", gamePlayersKey, memberId) ~= 1
      or not keyHasType(memberKey, "hash")
      or redis.call("EXISTS", memberKey) == 0
      or redis.call("HGET", memberKey, "team_id") ~= ARGV[2] then
      return invalidGameState()
    end
  end

  local currentTeamId = redis.call("HGET", playerKey, "team_id")
  if currentTeamId == ARGV[2] then
    if redis.call("SISMEMBER", teamPlayersKey, playerId) ~= 1 then
      return invalidGameState()
    end
    local ready = redis.call("HGET", playerKey, "ready") or "0"
    return {
      "${GAME_SCRIPT_RESULT.NO_OP}",
      redis.call("HGET", playerKey, "name") or "",
      ready
    }
  end

  if redis.call("SCARD", teamPlayersKey) >= 2 then
    return { "${ApiErrorCode.TEAM_FULL}" }
  end

  if currentTeamId then
    local oldTeamKey = KEYS[1] .. ":team:" .. currentTeamId
    local oldTeamPlayersKey = KEYS[1] .. ":team:" .. currentTeamId .. ":players"
    if not keyHasType(oldTeamKey, "hash")
      or redis.call("EXISTS", oldTeamKey) == 0
      or not keyHasType(oldTeamPlayersKey, "set")
      or redis.call("SISMEMBER", oldTeamPlayersKey, playerId) ~= 1 then
      return invalidGameState()
    end
    if redis.call("SISMEMBER", teamsKey, currentTeamId) ~= 1 then
      return invalidGameState()
    end
  end

  local playerName = redis.call("HGET", playerKey, "name")
  if not playerName then
    return invalidGameState()
  end

  if currentTeamId then
    redis.call("SREM", KEYS[1] .. ":team:" .. currentTeamId .. ":players", playerId)
  end

  redis.call("SADD", teamPlayersKey, playerId)
  redis.call("HSET", playerKey, "team_id", ARGV[2], "ready", "0")
  redis.call("SADD", gamePlayersKey, playerId)
  redis.call("HINCRBY", gameKey, "revision", 1)

  return { "${GAME_SCRIPT_RESULT.SUCCESS}", playerName, "0" }
`
