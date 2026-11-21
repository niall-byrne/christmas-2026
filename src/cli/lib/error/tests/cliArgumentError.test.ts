import { beforeEach, describe, expect, it } from "vitest"
import { CliArgumentError } from "@/cli/lib/error/cliArgumentError"
import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"

describe("CliArgumentError", () => {
  const TEST_FIXTURES = {
    flag: "--url",
    usage: "Usage: command [--url <origin>]",
  }

  describe("when an unknown option is provided", () => {
    let error: CliArgumentError

    beforeEach(() => {
      error = CliArgumentError.unknownOption(
        TEST_FIXTURES.flag,
        TEST_FIXTURES.usage
      )
    })

    it("creates a CLI argument error", () => {
      expect(error).toBeInstanceOf(CliArgumentError)
      expect(error).toBeInstanceOf(CliBaseError)
    })

    it("sets the CLI argument error name", () => {
      expect(error.name).toBe("CliArgumentError")
    })

    it("includes the option and usage in the message", () => {
      expect(error.message).toBe(
        `Unknown option: ${TEST_FIXTURES.flag}\n${TEST_FIXTURES.usage}`
      )
    })
  })

  describe("when an option value is missing", () => {
    let error: CliArgumentError

    beforeEach(() => {
      error = CliArgumentError.missingValue(
        TEST_FIXTURES.flag,
        TEST_FIXTURES.usage
      )
    })

    it("reports the option and usage", () => {
      expect(error.message).toBe(
        `Missing value for ${TEST_FIXTURES.flag}\n${TEST_FIXTURES.usage}`
      )
    })
  })

  describe("when an option is repeated", () => {
    let error: CliArgumentError

    beforeEach(() => {
      error = CliArgumentError.repeatedOption(
        TEST_FIXTURES.flag,
        TEST_FIXTURES.usage
      )
    })

    it("reports the option and usage", () => {
      expect(error.message).toBe(
        `Option ${TEST_FIXTURES.flag} can only be used once\n${TEST_FIXTURES.usage}`
      )
    })
  })
})
