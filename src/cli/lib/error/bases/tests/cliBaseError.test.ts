import { beforeEach, describe, expect, it } from "vitest"
import type { CliExitCode } from "@/contracts/cli/command"
import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"
import { CliFileError } from "@/cli/lib/error/cliFileError"

describe("CliBaseError", () => {
  const TEST_FIXTURES = {
    message: "Something went wrong",
    errorMessage: "Underlying failure",
    primitive: "Unexpected value",
  }

  describe("when constructed", () => {
    describe("when a message is provided", () => {
      let error: CliBaseError

      beforeEach(() => {
        error = new CliBaseError(TEST_FIXTURES.message)
      })

      it("sets the class name", () => {
        expect(error.name).toBe("CliBaseError")
      })

      it("sets the message", () => {
        expect(error.message).toBe(TEST_FIXTURES.message)
      })

      it("sets the CLI failure exit code", () => {
        expect(error.exitCode).toBe(1 satisfies CliExitCode)
      })
    })

    describe("when an error cause is provided", () => {
      let cause: Error
      let error: CliBaseError

      beforeEach(() => {
        cause = new Error(TEST_FIXTURES.errorMessage)
        error = new CliBaseError(TEST_FIXTURES.message, { cause })
      })

      it("preserves the error cause", () => {
        expect(error.cause).toBe(cause)
      })
    })
  })

  describe("when converting an unknown error value", () => {
    describe("when the value is already a CLI error", () => {
      let original: CliFileError
      let converted: CliBaseError

      beforeEach(() => {
        original = new CliFileError(TEST_FIXTURES.message)
        converted = CliBaseError.from(original)
      })

      it("returns the same CLI error instance", () => {
        expect(converted).toBe(original)
      })
    })

    describe("when the value is a standard Error", () => {
      let original: Error
      let converted: CliBaseError

      beforeEach(() => {
        original = new Error(TEST_FIXTURES.errorMessage)
        converted = CliBaseError.from(original)
      })

      it("wraps the original error in a CLI error", () => {
        expect(converted).toBeInstanceOf(CliBaseError)
      })

      it("preserves the original error message", () => {
        expect(converted.message).toBe(TEST_FIXTURES.errorMessage)
      })

      it("preserves the original error as the cause", () => {
        expect(converted.cause).toBe(original)
      })
    })

    describe("when the value is not an Error", () => {
      let converted: CliBaseError

      beforeEach(() => {
        converted = CliBaseError.from(TEST_FIXTURES.primitive)
      })

      it("converts the value to a CLI error message", () => {
        expect(converted).toBeInstanceOf(CliBaseError)
        expect(converted.message).toBe(TEST_FIXTURES.primitive)
      })
    })
  })
})
