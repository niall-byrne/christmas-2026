import "server-only"

export const createGameScript = `
  local gameKey = KEYS[1]
  local cardsKey = KEYS[2]

  if redis.call("EXISTS", gameKey) == 1 or redis.call("EXISTS", cardsKey) == 1 then
    return "GAME_ID_ALREADY_EXISTS"
  end

  local gameFields = {}
  for field, value in pairs(cjson.decode(ARGV[1])) do
    table.insert(gameFields, field)
    table.insert(gameFields, value)
  end

  local cardFields = {}
  for recipient, card in pairs(cjson.decode(ARGV[2])) do
    table.insert(cardFields, recipient)
    table.insert(cardFields, card)
  end

  if #gameFields == 0 or #cardFields == 0 then
    return redis.error_reply("INVALID_GAME_CREATION_DATA")
  end

  local cardsResult = redis.pcall("HSET", cardsKey, unpack(cardFields))
  if type(cardsResult) == "table" and cardsResult.err then
    return cardsResult
  end

  local gameResult = redis.pcall("HSET", gameKey, unpack(gameFields))
  if type(gameResult) == "table" and gameResult.err then
    redis.pcall("DEL", cardsKey)
    return gameResult
  end

  return "OK"
`
