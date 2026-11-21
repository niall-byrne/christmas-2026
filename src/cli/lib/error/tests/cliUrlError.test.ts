import { beforeEach, describe, expect, it } from "vitest"
import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"
import { CliUrlError } from "@/cli/lib/error/cliUrlError"

describe("CliUrlError", () => {
  const TEST_FIXTURES = {
    environmentVariable: "HOST",
    option: "--url",
    value: "https://games.test/path",
  }

  describe("when no target URL is configured", () => {
    let error: CliUrlError

    beforeEach(() => {
      error = CliUrlError.required(
        TEST_FIXTURES.environmentVariable,
        TEST_FIXTURES.option
      )
    })

    it("creates a CLI URL error", () => {
      expect(error).toBeInstanceOf(CliUrlError)
      expect(error).toBeInstanceOf(CliBaseError)
    })

    it("sets the CLI URL error name", () => {
      expect(error.name).toBe("CliUrlError")
    })

    it("names the environment variable and command option", () => {
      expect(error.message).toBe(
        `${TEST_FIXTURES.environmentVariable} environment variable or ${TEST_FIXTURES.option} flag is required`
      )
    })
  })

  describe("when the target URL is invalid", () => {
    let error: CliUrlError

    beforeEach(() => {
      error = CliUrlError.invalid(TEST_FIXTURES.value)
    })

    it("includes the invalid target value", () => {
      expect(error.message).toBe(`Invalid target URL: ${TEST_FIXTURES.value}`)
    })
  })

  describe("when the target URL is not an HTTP origin", () => {
    let error: CliUrlError

    beforeEach(() => {
      error = CliUrlError.originRequired(TEST_FIXTURES.value)
    })

    it("includes the URL that must be an HTTP origin", () => {
      expect(error.message).toBe(
        `Target URL must be an HTTP(S) origin: ${TEST_FIXTURES.value}`
      )
    })
  })
})
