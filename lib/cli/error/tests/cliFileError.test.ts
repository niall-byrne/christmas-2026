import { beforeEach, describe, expect, it } from "vitest"
import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"
import { CliFileError } from "@/lib/cli/error/cliFileError"

describe("CliFileError", () => {
  const TEST_FIXTURES = {
    file: "/tmp/game.json",
    reason: "permission denied",
    jsonReason: "Unexpected end of JSON input",
  }

  describe("when a file cannot be read", () => {
    let error: CliFileError

    beforeEach(() => {
      error = CliFileError.unreadable(TEST_FIXTURES.file, TEST_FIXTURES.reason)
    })

    it("creates a CLI file error", () => {
      expect(error).toBeInstanceOf(CliFileError)
      expect(error).toBeInstanceOf(CliBaseError)
    })

    it("sets the CLI file error name", () => {
      expect(error.name).toBe("CliFileError")
    })

    it("includes the file path and read reason", () => {
      expect(error.message).toBe(
        `Unable to read ${TEST_FIXTURES.file}: ${TEST_FIXTURES.reason}`
      )
    })
  })

  describe("when file contents contain invalid JSON", () => {
    let error: CliFileError

    beforeEach(() => {
      error = CliFileError.invalidJson(
        TEST_FIXTURES.file,
        TEST_FIXTURES.jsonReason
      )
    })

    it("includes the file path and parse reason", () => {
      expect(error.message).toBe(
        `Invalid JSON in ${TEST_FIXTURES.file}: ${TEST_FIXTURES.jsonReason}`
      )
    })
  })
})
