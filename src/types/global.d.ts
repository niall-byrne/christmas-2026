import type Redis from "ioredis"

declare global {
  var redisClient: Redis | undefined

  namespace NodeJS {
    interface ProcessEnv {
      HOST?: string
      NEXT_PUBLIC_GAME_CLIENT_LOGGING?: "true" | "false"
    }
  }
}

export {}
