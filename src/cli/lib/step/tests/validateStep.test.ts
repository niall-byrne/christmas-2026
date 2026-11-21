import { beforeEach, describe, expect, it, vi } from "vitest"
import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"
import { ValidateStep } from "@/cli/lib/step/validateStep"

describe("ValidateStep", () => {
  const TEST_FIXTURES = { game: { name: " Winter game " } }

  describe("when the workflow contains the value to validate", () => {
    let validate: (value: unknown) => unknown
    let result: Record<string, unknown>

    beforeEach(async () => {
      validate = vi.fn((value: unknown) => {
        if (
          typeof value !== "object" ||
          value === null ||
          !("name" in value) ||
          typeof value.name !== "string"
        ) {
          return value
        }
        return { name: value.name.trim() }
      })
      const step = new ValidateStep({ key: "game", validate })
      result = await step.run(TEST_FIXTURES)
    })

    it("returns the validated value under the same key", () => {
      expect(result).toEqual({ game: { name: "Winter game" } })
    })

    it("passes the workflow value to the validator", () => {
      expect(validate).toHaveBeenCalledWith(TEST_FIXTURES.game)
    })
  })

  describe("when the workflow value is missing", () => {
    let validate: (value: unknown) => unknown
    let request: Promise<unknown>

    beforeEach(() => {
      validate = vi.fn((value: unknown) => value)
      const step = new ValidateStep({ key: "game", validate })
      request = step.run({}).catch((error: unknown) => error)
    })

    it("rejects with a CLI error", async () => {
      await expect(request).resolves.toBeInstanceOf(CliBaseError)
    })

    it("does not call the validator", () => {
      expect(validate).not.toHaveBeenCalled()
    })
  })
})
