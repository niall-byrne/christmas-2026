import "server-only"
import { ApiErrorCode } from "@/contracts/game/api/data"

export const planPlayerRemovals = `
  local function planPlayerRemovals(
    gameKey,
    gamePlayersKey,
    playerNamesKey,
    initialRemovalId,
    proposedTargetId,
    proposedCallerId,
    resolveVotes
  )
    local playerIds = redis.call("SMEMBERS", gamePlayersKey)
    local players = {}
    local active = {}
    local votes = {}
    local removals = {}

    for _, playerId in ipairs(playerIds) do
      if string.len(playerId) ~= 24 or not string.match(playerId, "^[a-f0-9]+$") then
        return invalidGameState()
      end

      local playerKey = gameKey .. ":player:" .. playerId
      if not keyHasType(playerKey, "hash") or redis.call("EXISTS", playerKey) == 0 then
        return invalidGameState()
      end

      local name = redis.call("HGET", playerKey, "name")
      local normalizedName = redis.call("HGET", playerKey, "normalized_name")
      local teamId = redis.call("HGET", playerKey, "team_id")
      if not name or not normalizedName
        or redis.call("SISMEMBER", playerNamesKey, normalizedName) ~= 1 then
        return invalidGameState()
      end

      if teamId then
        if string.len(teamId) ~= 24 or not string.match(teamId, "^[a-f0-9]+$") then
          return invalidGameState()
        end
        local teamKey = gameKey .. ":team:" .. teamId
        local teamPlayersKey = teamKey .. ":players"
        if not keyHasType(teamKey, "hash")
          or redis.call("EXISTS", teamKey) == 0
          or not keyHasType(teamPlayersKey, "set")
          or redis.call("SISMEMBER", teamPlayersKey, playerId) ~= 1 then
          return invalidGameState()
        end
      end

      players[playerId] = {
        key = playerKey,
        name = name,
        normalizedName = normalizedName,
        teamId = teamId,
      }
      active[playerId] = true

      if resolveVotes then
        local voteKey = gameKey .. ":remove-vote:" .. playerId
        local approvalsKey = voteKey .. ":approvals"
        if not keyHasType(voteKey, "hash") or not keyHasType(approvalsKey, "set") then
          return invalidGameState()
        end

        local voteExists = redis.call("EXISTS", voteKey) == 1
        local approvalsExist = redis.call("EXISTS", approvalsKey) == 1
        local approvals = {}
        if voteExists then
          if redis.call("HGET", voteKey, "target_player_id") ~= playerId
            or redis.call("TTL", voteKey) < 0
            or not approvalsExist
            or redis.call("TTL", approvalsKey) < 0 then
            return invalidGameState()
          end
          for _, approvalId in ipairs(redis.call("SMEMBERS", approvalsKey)) do
            approvals[approvalId] = true
          end
        elseif approvalsExist then
          return invalidGameState()
        end

        votes[playerId] = {
          exists = voteExists,
          wasExisting = voteExists,
          approvals = approvals,
        }
      end
    end

    if initialRemovalId then
      if not active[initialRemovalId] then
        return { error = "${ApiErrorCode.PLAYER_NOT_FOUND}" }
      end
      active[initialRemovalId] = false
      table.insert(removals, initialRemovalId)
    end

    if proposedTargetId then
      if not active[proposedTargetId] or not active[proposedCallerId] then
        return { error = "${ApiErrorCode.PLAYER_NOT_FOUND}" }
      end
      local proposedVote = votes[proposedTargetId]
      if not proposedVote then
        return invalidGameState()
      end
      proposedVote.exists = true
      proposedVote.approvals[proposedCallerId] = true
    end

    if resolveVotes then
      local changed = true
      while changed do
        changed = false
        for _, targetId in ipairs(playerIds) do
          local vote = votes[targetId]
          if active[targetId] and vote and vote.exists then
            local eligibleCount = 0
            local allApproved = true
            for _, playerId in ipairs(playerIds) do
              if active[playerId] and playerId ~= targetId then
                eligibleCount = eligibleCount + 1
                if not vote.approvals[playerId] then
                  allApproved = false
                end
              end
            end
            if eligibleCount > 0 and allApproved then
              active[targetId] = false
              table.insert(removals, targetId)
              changed = true
            end
          end
        end
      end
    end

    local proposedApprovalCount = 0
    local proposedEligibleCount = 0
    if proposedTargetId and active[proposedTargetId] then
      local proposedVote = votes[proposedTargetId]
      for _, playerId in ipairs(playerIds) do
        if active[playerId] and playerId ~= proposedTargetId then
          proposedEligibleCount = proposedEligibleCount + 1
          if proposedVote.approvals[playerId] then
            proposedApprovalCount = proposedApprovalCount + 1
          end
        end
      end
    end

    return {
      playerIds = playerIds,
      players = players,
      active = active,
      votes = votes,
      removals = removals,
      proposedApprovalCount = proposedApprovalCount,
      proposedEligibleCount = proposedEligibleCount,
    }
  end

  local function applyPlayerRemovals(
    gameKey,
    gamePlayersKey,
    playerNamesKey,
    plan,
    resolveVotes
  )
    for _, playerId in ipairs(plan.removals) do
      local player = plan.players[playerId]
      if player.teamId then
        redis.call(
          "SREM",
          gameKey .. ":team:" .. player.teamId .. ":players",
          playerId
        )
      end
      redis.call("SREM", playerNamesKey, player.normalizedName)
      redis.call("SREM", gamePlayersKey, playerId)
      local voteKey = gameKey .. ":remove-vote:" .. playerId
      redis.call(
        "DEL",
        player.key,
        voteKey,
        voteKey .. ":approvals"
      )
    end

    if resolveVotes then
      for targetId, vote in pairs(plan.votes) do
        if plan.active[targetId] and vote.exists then
          local approvalsKey =
            gameKey .. ":remove-vote:" .. targetId .. ":approvals"
          for _, removedId in ipairs(plan.removals) do
            redis.call("SREM", approvalsKey, removedId)
          end
        end
      end
    end
  end
`
