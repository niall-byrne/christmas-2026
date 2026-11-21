import "server-only"
import { ApiErrorCode, GAME_COMPLETE_LEVEL } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const updateGameScript = `
  ${gameMutationValidation}

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

  local completedTeams = {}
  if level == "${GAME_COMPLETE_LEVEL}" then
    local ttlSeconds = tonumber(ARGV[3])
    if not keyHasType(KEYS[1], "hash")
      or not keyHasType(KEYS[3], "set")
      or not revisionCanIncrement(gameKey)
      or ttlSeconds == nil
      or ttlSeconds < 1
      or ttlSeconds ~= math.floor(ttlSeconds) then
      return invalidGameState()
    end

    local completedTeamIds = redis.call("SMEMBERS", KEYS[3])
    for _, teamId in ipairs(completedTeamIds) do
      local teamPlayersKey = teamKeyPrefix .. teamId .. teamPlayersSuffix
      if not keyHasType(teamPlayersKey, "set") then
        return invalidGameState()
      end
      table.insert(completedTeams, {
        teamId = teamId,
        playerIds = redis.call("SMEMBERS", teamPlayersKey),
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

    for _, team in ipairs(completedTeams) do
      local teamId = team.teamId
      local teamKey = teamKeyPrefix .. teamId
      local teamPlayersKey = teamKey .. teamPlayersSuffix
      redis.call("EXPIRE", teamKey, ttlSeconds)
      redis.call("EXPIRE", teamPlayersKey, ttlSeconds)

      local playerKeyPrefix = teamKey .. playerKeyPrefixSuffix
      for _, playerId in ipairs(team.playerIds) do
        redis.call("EXPIRE", playerKeyPrefix .. playerId, ttlSeconds)
      end
    end
  end

  return { "${GAME_SCRIPT_RESULT.SUCCESS}", revision }
`
