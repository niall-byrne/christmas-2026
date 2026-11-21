import "server-only"

export const gameMutationValidation = `
  local function keyHasType(key, expected)
    local actual = redis.call("TYPE", key).ok
    return actual == "none" or actual == expected
  end

  local function revisionCanIncrement(gameKey)
    local rawRevision = redis.call("HGET", gameKey, "revision")
    if not rawRevision or not string.match(rawRevision, "^%d+$") then
      return false
    end

    local revision = tonumber(rawRevision)
    return revision ~= nil
      and revision >= 1
      and revision < 9007199254740991
      and revision == math.floor(revision)
  end

  local function invalidGameState()
    return redis.error_reply("INVALID_GAME_STATE")
  end
`
