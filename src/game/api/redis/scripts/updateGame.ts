import "server-only"
import { ApiErrorCode, GAME_COMPLETE_LEVEL } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { planPlayerRemovals } from "@/game/api/redis/scripts/planPlayerRemovals"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const updateGameScript = `
  ${gameMutationValidation}
  ${planPlayerRemovals}

  local gameKey = KEYS[1]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  local name = ARGV[1]
  local level = ARGV[2]
  local ttlSeconds = tonumber(ARGV[3])
  local teamKeyPrefix = ARGV[4]
  local teamPlayersSuffix = ARGV[5]

  local completedTeams = {}
  local completedPlayerIds = {}
  local pendingVoteKeys = {}
  if level == "${GAME_COMPLETE_LEVEL}" then
    if not keyHasType(KEYS[1], "hash")
      or not keyHasType(KEYS[3], "set")
      or not keyHasType(KEYS[6], "set")
      or not keyHasType(KEYS[7], "set")
      or not revisionCanIncrement(gameKey)
      or ttlSeconds == nil
      or ttlSeconds < 1
      or ttlSeconds ~= math.floor(ttlSeconds) then
      return invalidGameState()
    end

    local playerPlan = planPlayerRemovals(
      gameKey,
      KEYS[6],
      KEYS[7],
      nil,
      nil,
      nil,
      false
    )
    if playerPlan.err then
      return playerPlan
    end
    completedPlayerIds = playerPlan.playerIds

    local completedTeamIds = redis.call("SMEMBERS", KEYS[3])
    for _, teamId in ipairs(completedTeamIds) do
      local teamKey = teamKeyPrefix .. teamId
      local teamPlayersKey = teamKeyPrefix .. teamId .. teamPlayersSuffix
      if not keyHasType(teamKey, "hash")
        or not keyHasType(teamPlayersKey, "set")
        or redis.call("EXISTS", teamKey) == 0 then
        return invalidGameState()
      end
      local playerIds = redis.call("SMEMBERS", teamPlayersKey)
      for _, playerId in ipairs(playerIds) do
        if redis.call("SISMEMBER", KEYS[6], playerId) ~= 1 then
          return invalidGameState()
        end
      end
      table.insert(completedTeams, {
        teamId = teamId,
      })
    end
  elseif not keyHasType(gameKey, "hash") or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end

  local nameChanged = name ~= "" and redis.call("HGET", gameKey, "name") ~= name
  local levelChanged = level ~= "" and redis.call("HGET", gameKey, "level") ~= level
  if not nameChanged and not levelChanged then
    return { "${GAME_SCRIPT_RESULT.NO_OP}" }
  end

  if levelChanged and level ~= "0" then
    if not keyHasType(KEYS[6], "set") then
      return invalidGameState()
    end
    for _, playerId in ipairs(redis.call("SMEMBERS", KEYS[6])) do
      local voteKey = gameKey .. ":remove-vote:" .. playerId
      local approvalsKey = voteKey .. ":approvals"
      if not keyHasType(voteKey, "hash")
        or not keyHasType(approvalsKey, "set") then
        return invalidGameState()
      end
      local voteExists = redis.call("EXISTS", voteKey) == 1
      local approvalsExist = redis.call("EXISTS", approvalsKey) == 1
      if (voteExists and redis.call("HGET", voteKey, "target_player_id") ~= playerId)
        or (voteExists and redis.call("TTL", voteKey) < 0)
        or (voteExists and not approvalsExist)
        or (not voteExists and approvalsExist) then
        return invalidGameState()
      end
      table.insert(pendingVoteKeys, voteKey)
      table.insert(pendingVoteKeys, approvalsKey)
    end
  end

  if name ~= "" then
    redis.call("HSET", gameKey, "name", name)
  end

  if level ~= "" then
    redis.call("HSET", gameKey, "level", level)
  end

  local revision = redis.call("HINCRBY", gameKey, "revision", 1)

  for _, voteKey in ipairs(pendingVoteKeys) do
    redis.call("DEL", voteKey)
  end

  if level == "${GAME_COMPLETE_LEVEL}" then
    for keyIndex = 1, #KEYS do
      redis.call("EXPIRE", KEYS[keyIndex], ttlSeconds)
    end

    for _, team in ipairs(completedTeams) do
      local teamId = team.teamId
      local teamKey = teamKeyPrefix .. teamId
      local teamPlayersKey = teamKey .. teamPlayersSuffix
      redis.call("EXPIRE", teamKey, ttlSeconds)
      redis.call("EXPIRE", teamPlayersKey, ttlSeconds)
    end

    for _, playerId in ipairs(completedPlayerIds) do
      redis.call("EXPIRE", gameKey .. ":player:" .. playerId, ttlSeconds)
    end
  end

  return { "${GAME_SCRIPT_RESULT.SUCCESS}", revision }
`
