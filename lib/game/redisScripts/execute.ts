import "server-only"
import { ApiErrorCode } from "@/contracts/gameData"
import { ApiRouteError } from "@/lib/api/error/endpoint"
import type Redis from "ioredis"

const SCRIPT_ERROR_STATUSES: Partial<Record<ApiErrorCode, number>> = {
  [ApiErrorCode.GAME_NOT_FOUND]: 404,
  [ApiErrorCode.TEAM_NOT_FOUND]: 404,
  [ApiErrorCode.PLAYER_NOT_FOUND]: 404,
  [ApiErrorCode.TEAM_NAME_NOT_AVAILABLE]: 409,
  [ApiErrorCode.TEAM_COLOUR_NOT_AVAILABLE]: 409,
  [ApiErrorCode.NAME_NOT_AVAILABLE]: 409,
  [ApiErrorCode.RECIPIENT_NOT_FOUND]: 422,
  [ApiErrorCode.TEAM_FULL]: 422,
}

function isScriptValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number"
}

export async function executeGameScript(
  client: Redis,
  script: string,
  keys: string[],
  args: string[] = []
): Promise<Array<string | number>> {
  const result: unknown = await client.eval(
    script,
    keys.length,
    ...keys,
    ...args
  )

  if (
    !Array.isArray(result) ||
    result.length === 0 ||
    !result.every(isScriptValue)
  ) {
    throw new Error("Redis game script returned an invalid result")
  }

  const [resultCode, ...values] = result
  if (resultCode === "OK") {
    return values
  }

  if (typeof resultCode === "string") {
    const errorCode = Object.values(ApiErrorCode).find(
      (code) => code === resultCode
    )
    const statusCode = errorCode ? SCRIPT_ERROR_STATUSES[errorCode] : undefined

    if (errorCode && statusCode !== undefined) {
      throw new ApiRouteError(errorCode, statusCode)
    }
  }

  throw new Error(`Redis game script returned an unknown result: ${resultCode}`)
}
