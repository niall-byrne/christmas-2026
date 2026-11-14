import { describe, expect, it } from "vitest"
import { ApiRouteError } from "@/lib/api/error/endpoint"

describe("ApiRouteError", () => {
  it("defaults client-side route errors to HTTP 400", () => {
    const error = new ApiRouteError("INVALID_JSON")

    expect(error.statusCode).toBe(400)
    expect(error.error).toBe("INVALID_JSON")
  })

  it("preserves an explicitly supplied status code and message", () => {
    const error = new ApiRouteError("GAME_NOT_FOUND", 404, "Game is missing")

    expect(error.statusCode).toBe(404)
    expect(error.message).toBe("Game is missing")
  })
})
