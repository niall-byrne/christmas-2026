import "server-only"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { planPlayerRemovals } from "@/game/api/redis/scripts/planPlayerRemovals"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const removePlayerClaimScript = `
  ${gameMutationValidation}
  ${planPlayerRemovals}

  local gameKey = KEYS[1]
  local gamePlayersKey = KEYS[2]
  local playerNamesKey = KEYS[3]
  local playerKey = KEYS[4]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end
  if redis.call("EXISTS", playerKey) == 0 then
    return { "${ApiErrorCode.PLAYER_NOT_FOUND}" }
  end
  if not keyHasType(gameKey, "hash")
    or not keyHasType(gamePlayersKey, "set")
    or not keyHasType(playerNamesKey, "set")
    or not keyHasType(playerKey, "hash")
    or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end

  local playerId = ARGV[1]
  local resolveVotes = redis.call("HGET", gameKey, "level") == "0"
  local plan = planPlayerRemovals(
    gameKey,
    gamePlayersKey,
    playerNamesKey,
    playerId,
    nil,
    nil,
    resolveVotes
  )
  if plan.error then
    return { plan.error }
  end
  if plan.err then
    return plan
  end

  local playerName = plan.players[playerId].name
  applyPlayerRemovals(
    gameKey,
    gamePlayersKey,
    playerNamesKey,
    plan,
    resolveVotes
  )
  redis.call("HINCRBY", gameKey, "revision", 1)
  return { "${GAME_SCRIPT_RESULT.SUCCESS}", playerName }
`
