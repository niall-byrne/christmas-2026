import "server-only"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const addPlayerScript = `
  ${gameMutationValidation}

  local gameKey = KEYS[1]
  local cardsKey = KEYS[2]
  local playerNamesKey = KEYS[3]
  local gamePlayersKey = KEYS[4]
  local playerKey = KEYS[5]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end

  if not keyHasType(gameKey, "hash")
    or not keyHasType(cardsKey, "hash")
    or not keyHasType(playerNamesKey, "set")
    or not keyHasType(gamePlayersKey, "set")
    or not keyHasType(playerKey, "hash")
    or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end
  if redis.call("EXISTS", playerKey) == 1 then
    return invalidGameState()
  end

  local normalizedName = ARGV[1]
  local cardJson = redis.call("HGET", cardsKey, normalizedName)
  if not cardJson then
    return { "${ApiErrorCode.RECIPIENT_NOT_FOUND}" }
  end

  if redis.call("SISMEMBER", playerNamesKey, normalizedName) == 1 then
    return { "${ApiErrorCode.NAME_NOT_AVAILABLE}" }
  end

  local payload = cjson.decode(cardJson)
  local playerId = ARGV[2]
  local playerName = payload["recipient"] or ARGV[3]
  local ready = "0"

  redis.call(
    "HSET",
    playerKey,
    "name",
    playerName,
    "normalized_name",
    normalizedName,
    "ready",
    ready
  )
  redis.call("SADD", gamePlayersKey, playerId)
  redis.call("SADD", playerNamesKey, normalizedName)
  redis.call("HINCRBY", gameKey, "revision", 1)

  return { "${GAME_SCRIPT_RESULT.SUCCESS}", playerId, playerName, ready }
`
