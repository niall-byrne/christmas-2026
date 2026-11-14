import "server-only"

export const incrementRevisionScript = `
  local gameKey = KEYS[1]
  if redis.call("EXISTS", gameKey) == 0 then
    return { "GAME_NOT_FOUND" }
  end
  local revision = redis.call("HINCRBY", gameKey, "revision", 1)
  return { "OK", revision }
`
