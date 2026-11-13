// @vitest-environment node

import { describe, it, expect, beforeEach } from "vitest"
import type { AuthorizationErrorReason } from "@/contracts/api"
import {
  AuthorizationError,
  MissingAuthSecretError,
} from "@/lib/api/error/auth"
import { ERROR_MESSAGE_MAP } from "@/schemas/gameData"

describe("auth error classes", () => {
  describe("MissingAuthSecretError", () => {
    describe("when instantiated with default message", () => {
      let error: MissingAuthSecretError

      beforeEach(() => {
        error = new MissingAuthSecretError()
      })

      it("populates statusCode 500, INTERNAL_SERVER_ERROR code, and MISSING_AUTH_SECRET reason", () => {
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(MissingAuthSecretError)
        expect(error.name).toBe("MissingAuthSecretError")
        expect(error.code).toBe("INTERNAL_SERVER_ERROR")
        expect(error.reason).toBe("MISSING_AUTH_SECRET")
        expect(error.statusCode).toBe(500)
        expect(error.message).toBe(
          "AUTH_SECRET environment variable is not configured"
        )
      })
    })

    describe("when instantiated with a custom message", () => {
      let error: MissingAuthSecretError

      beforeEach(() => {
        error = new MissingAuthSecretError("Custom missing secret message")
      })

      it("preserves the custom message", () => {
        expect(error.message).toBe("Custom missing secret message")
      })
    })
  })

  describe("AuthorizationError", () => {
    describe.each<AuthorizationErrorReason>([
      "MISSING_COOKIE",
      "MALFORMED_TOKEN",
      "INVALID_SIGNATURE",
      "GAME_ID_MISMATCH",
    ])("when instantiated with reason %s", (reason) => {
      let error: AuthorizationError

      beforeEach(() => {
        error = new AuthorizationError(reason)
      })

      it("populates statusCode 401, UNAUTHORIZED code, default message, and reason", () => {
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(AuthorizationError)
        expect(error.name).toBe("AuthorizationError")
        expect(error.code).toBe("UNAUTHORIZED")
        expect(error.statusCode).toBe(401)
        expect(error.reason).toBe(reason)
        expect(error.message).toBe(ERROR_MESSAGE_MAP.get("UNAUTHORIZED"))
      })
    })

    describe("when instantiated with a custom message", () => {
      let error: AuthorizationError

      beforeEach(() => {
        error = new AuthorizationError("INVALID_SIGNATURE", "Bad HMAC")
      })

      it("preserves the custom message and reason", () => {
        expect(error.reason).toBe("INVALID_SIGNATURE")
        expect(error.message).toBe("Bad HMAC")
      })
    })
  })
})
