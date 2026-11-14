import "server-only"

export class GameScripts {
  static readonly incrementRevision = `
    local gameKey = KEYS[1]
    if redis.call("EXISTS", gameKey) == 0 then
      return { "GAME_NOT_FOUND" }
    end
    local revision = redis.call("HINCRBY", gameKey, "revision", 1)
    return { "OK", revision }
  `

  static readonly createTeam = `
    local gameKey = KEYS[1]
    local gameMembersKey = KEYS[2]
    local teamNamesKey = KEYS[3]
    local teamColorsKey = KEYS[4]
    local teamKey = KEYS[5]

    if redis.call("EXISTS", gameKey) == 0 then
      return { "GAME_NOT_FOUND" }
    end

    local normalizedName = ARGV[1]
    local normalizedColour = ARGV[2]
    local teamId = ARGV[3]
    local teamName = ARGV[4]
    local teamColor = ARGV[5]
    local score = ARGV[6]

    if redis.call("SISMEMBER", teamNamesKey, normalizedName) == 1 then
      return { "TEAM_NAME_NOT_AVAILABLE" }
    end

    if redis.call("SISMEMBER", teamColorsKey, normalizedColour) == 1 then
      return { "TEAM_COLOUR_NOT_AVAILABLE" }
    end

    redis.call("HSET", teamKey, "name", teamName, "color", teamColor, "score", score)
    redis.call("SADD", gameMembersKey, teamId)
    redis.call("SADD", teamNamesKey, normalizedName)
    redis.call("SADD", teamColorsKey, normalizedColour)
    redis.call("HINCRBY", gameKey, "revision", 1)

    return { "OK", teamId }
  `

  static readonly addPlayer = `
    local gameKey = KEYS[1]
    local teamKey = KEYS[2]
    local teamPlayersKey = KEYS[3]
    local cardsKey = KEYS[4]
    local playerNamesKey = KEYS[5]
    local gamePlayersKey = KEYS[6]
    local playerKey = KEYS[7]

    if redis.call("EXISTS", gameKey) == 0 then
      return { "GAME_NOT_FOUND" }
    end

    if redis.call("EXISTS", teamKey) == 0 then
      return { "TEAM_NOT_FOUND" }
    end

    local normalizedName = ARGV[1]
    local cardJson = redis.call("HGET", cardsKey, normalizedName)
    if not cardJson then
      return { "RECIPIENT_NOT_FOUND" }
    end

    if redis.call("SISMEMBER", playerNamesKey, normalizedName) == 1 then
      return { "NAME_NOT_AVAILABLE" }
    end

    if redis.call("SCARD", teamPlayersKey) >= 2 then
      return { "TEAM_FULL" }
    end

    local payload = cjson.decode(cardJson)
    local playerId = ARGV[2]
    local playerName = payload["recipient"]
    local ready = "0"

    redis.call("HSET", playerKey, "name", playerName, "ready", ready)
    redis.call("SADD", teamPlayersKey, playerId)
    redis.call("SADD", gamePlayersKey, playerId)
    redis.call("SADD", playerNamesKey, normalizedName)
    redis.call("HINCRBY", gameKey, "revision", 1)

    return { "OK", playerId, playerName, ready }
  `

  static readonly removePlayer = `
    local gameKey = KEYS[1]
    local teamKey = KEYS[2]
    local teamPlayersKey = KEYS[3]
    local gamePlayersKey = KEYS[4]
    local playerNamesKey = KEYS[5]
    local playerKey = KEYS[6]

    if redis.call("EXISTS", gameKey) == 0 then
      return { "GAME_NOT_FOUND" }
    end

    if redis.call("EXISTS", teamKey) == 0 then
      return { "TEAM_NOT_FOUND" }
    end

    if redis.call("EXISTS", playerKey) == 0 then
      return { "PLAYER_NOT_FOUND" }
    end

    local playerName = redis.call("HGET", playerKey, "name")
    local playerId = ARGV[1]

    redis.call("SREM", gamePlayersKey, playerId)
    redis.call("SREM", teamPlayersKey, playerId)
    redis.call("SREM", playerNamesKey, playerName:lower():gsub("%s+", " "))
    redis.call("DEL", playerKey)
    redis.call("HINCRBY", gameKey, "revision", 1)

    return { "OK", playerName }
  `

  static readonly setReadyStatus = `
    local gameKey = KEYS[1]
    local teamKey = KEYS[2]
    local playerKey = KEYS[3]
    local readyValue = ARGV[1]

    if redis.call("EXISTS", gameKey) == 0 then
      return { "GAME_NOT_FOUND" }
    end

    if redis.call("EXISTS", teamKey) == 0 then
      return { "TEAM_NOT_FOUND" }
    end

    if redis.call("EXISTS", playerKey) == 0 then
      return { "PLAYER_NOT_FOUND" }
    end

    redis.call("HSET", playerKey, "ready", readyValue)
    redis.call("HINCRBY", gameKey, "revision", 1)
    return { "OK", readyValue }
  `
}
