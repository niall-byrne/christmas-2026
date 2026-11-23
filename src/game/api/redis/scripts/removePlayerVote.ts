import "server-only"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { gameMutationValidation } from "@/game/api/redis/scripts/mutationValidation"
import { planPlayerRemovals } from "@/game/api/redis/scripts/planPlayerRemovals"
import { GAME_SCRIPT_RESULT } from "@/game/api/redis/scripts/resultCodes"

export const approveRemovePlayerScript = `
  ${gameMutationValidation}
  ${planPlayerRemovals}

  local gameKey = KEYS[1]
  local gamePlayersKey = KEYS[2]
  local playerNamesKey = KEYS[3]
  local targetKey = KEYS[4]
  local voteKey = KEYS[5]
  local approvalsKey = KEYS[6]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end
  if redis.call("HGET", gameKey, "level") ~= "0" then
    return { "${ApiErrorCode.GAME_NOT_IN_LOBBY}" }
  end
  if redis.call("EXISTS", targetKey) == 0 then
    return { "${ApiErrorCode.PLAYER_NOT_FOUND}" }
  end

  local callerId = ARGV[1]
  local targetId = ARGV[2]
  if callerId == targetId then
    return { "${ApiErrorCode.CANNOT_REMOVE_SELF}" }
  end

  if not keyHasType(gameKey, "hash")
    or not keyHasType(gamePlayersKey, "set")
    or not keyHasType(playerNamesKey, "set")
    or not keyHasType(targetKey, "hash")
    or not keyHasType(voteKey, "hash")
    or not keyHasType(approvalsKey, "set")
    or not revisionCanIncrement(gameKey) then
    return invalidGameState()
  end

  local approvalAlreadyExists =
    redis.call("SISMEMBER", approvalsKey, callerId) == 1
  local plan = planPlayerRemovals(
    gameKey,
    gamePlayersKey,
    playerNamesKey,
    nil,
    targetId,
    callerId,
    true
  )
  if plan.error then
    return { plan.error }
  end
  if plan.err then
    return plan
  end

  local vote = plan.votes[targetId]
  local isNewApproval = not approvalAlreadyExists
  if not vote.wasExisting or isNewApproval then
    if not vote.wasExisting then
      redis.call("HSET", voteKey, "target_player_id", targetId)
    end
    redis.call("SADD", approvalsKey, callerId)
    redis.call("EXPIRE", voteKey, 300)
    redis.call("EXPIRE", approvalsKey, 300)
  end

  if #plan.removals > 0 then
    applyPlayerRemovals(
      gameKey,
      gamePlayersKey,
      playerNamesKey,
      plan,
      true
    )
    redis.call("HINCRBY", gameKey, "revision", 1)
    return {
      "${GAME_SCRIPT_RESULT.SUCCESS}",
      plan.proposedApprovalCount,
      plan.proposedEligibleCount,
      plan.active[targetId] and "0" or "1",
    }
  end

  return {
    "${GAME_SCRIPT_RESULT.NO_OP}",
    plan.proposedApprovalCount,
    plan.proposedEligibleCount,
  }
`

export const cancelRemovePlayerScript = `
  ${gameMutationValidation}

  local gameKey = KEYS[1]
  local voteKey = KEYS[2]
  local approvalsKey = KEYS[3]

  if redis.call("EXISTS", gameKey) == 0 then
    return { "${ApiErrorCode.GAME_NOT_FOUND}" }
  end
  if redis.call("HGET", gameKey, "level") ~= "0" then
    return { "${ApiErrorCode.GAME_NOT_IN_LOBBY}" }
  end

  if not keyHasType(gameKey, "hash")
    or not keyHasType(voteKey, "hash")
    or not keyHasType(approvalsKey, "set") then
    return invalidGameState()
  end
  if redis.call("EXISTS", voteKey) == 1
    and redis.call("HGET", voteKey, "target_player_id") == nil then
    return invalidGameState()
  end

  redis.call("SREM", approvalsKey, ARGV[1])
  if redis.call("SCARD", approvalsKey) == 0 then
    redis.call("DEL", voteKey, approvalsKey)
  end
  return { "${GAME_SCRIPT_RESULT.NO_OP}" }
`
