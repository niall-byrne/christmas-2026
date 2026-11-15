import type Redis from "ioredis"

declare global {
  var redisClient: Redis | undefined

  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_GAME_CLIENT_LOGGING?: "true" | "false"
    }
  }
}

export {}
