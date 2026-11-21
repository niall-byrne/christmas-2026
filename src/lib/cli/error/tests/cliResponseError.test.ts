import { beforeEach, describe, expect, it } from "vitest"
import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"
import { CliResponseError } from "@/lib/cli/error/cliResponseError"

describe("CliResponseError", () => {
  const TEST_FIXTURES = {
    operation: "Create game",
    status: 422,
    error: "INVALID_GAME",
    message: "Game data is invalid",
  }

  describe("when the server response contains invalid JSON", () => {
    let responseError: CliResponseError

    beforeEach(() => {
      responseError = CliResponseError.invalidJson(TEST_FIXTURES.status)
    })

    it("creates a CLI response error", () => {
      expect(responseError).toBeInstanceOf(CliResponseError)
      expect(responseError).toBeInstanceOf(CliBaseError)
    })

    it("sets the CLI response error name", () => {
      expect(responseError.name).toBe("CliResponseError")
    })

    it("includes the HTTP status in the message", () => {
      expect(responseError.message).toBe(
        `The server returned invalid JSON (HTTP ${TEST_FIXTURES.status})`
      )
    })
  })

  describe("when the server response is malformed", () => {
    let responseError: CliResponseError

    beforeEach(() => {
      responseError = CliResponseError.malformed(
        TEST_FIXTURES.operation,
        TEST_FIXTURES.status
      )
    })

    it("includes the operation, HTTP status, and malformed response detail", () => {
      expect(responseError.message).toBe(
        `${TEST_FIXTURES.operation} failed with HTTP ${TEST_FIXTURES.status}: malformed error response`
      )
    })
  })

  describe("when the server returns a request error", () => {
    let responseError: CliResponseError

    beforeEach(() => {
      responseError = CliResponseError.requestFailed(
        TEST_FIXTURES.operation,
        TEST_FIXTURES.status,
        TEST_FIXTURES.error,
        TEST_FIXTURES.message
      )
    })

    it("includes the operation, HTTP status, error code, and message", () => {
      expect(responseError.message).toBe(
        `${TEST_FIXTURES.operation} failed with HTTP ${TEST_FIXTURES.status}: ${TEST_FIXTURES.error}: ${TEST_FIXTURES.message}`
      )
    })
  })
})
