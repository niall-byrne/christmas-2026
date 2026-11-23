import { describe, expect, it } from "vitest"
import { ApiErrorCode } from "@/contracts/game/api/data"
import {
  API_ENDPOINT_INVARIANT_REASON,
  ApiEndpointInvariantError,
  ApiRouteError,
} from "@/game/api/error/endpoint"

describe("ApiRouteError", () => {
  it("defaults client-side route errors to HTTP 400", () => {
    const error = new ApiRouteError(ApiErrorCode.INVALID_JSON)

    expect(error.statusCode).toBe(400)
    expect(error.error).toBe(ApiErrorCode.INVALID_JSON)
  })

  describe("ApiEndpointInvariantError", () => {
    it("preserves the invariant reason and diagnostic message", () => {
      const error = new ApiEndpointInvariantError(
        API_ENDPOINT_INVARIANT_REASON.PLAYER_IDENTITY_MISSING
      )

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("ApiEndpointInvariantError")
      expect(error.reason).toBe(
        API_ENDPOINT_INVARIANT_REASON.PLAYER_IDENTITY_MISSING
      )
      expect(error.message).toBe("Player authorization was not completed")
    })
  })

  it("preserves an explicitly supplied status code and message", () => {
    const error = new ApiRouteError(
      ApiErrorCode.GAME_NOT_FOUND,
      404,
      "Game is missing"
    )

    expect(error.statusCode).toBe(404)
    expect(error.message).toBe("Game is missing")
  })

  it("preserves response headers for rate-limited requests", () => {
    const error = new ApiRouteError(ApiErrorCode.RATE_LIMITED, 429, undefined, {
      "Retry-After": "900",
    })

    expect(error.statusCode).toBe(429)
    expect(error.headers).toEqual({ "Retry-After": "900" })
  })
})
