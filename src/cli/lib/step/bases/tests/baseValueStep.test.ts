import { beforeEach, describe, expect, it } from "vitest"
import type { CliPromptField } from "@/contracts/cli/step"
import { BaseValueStep } from "@/cli/lib/step/bases/baseValueStep"
import { z } from "zod"

class TestValueStep extends BaseValueStep {
  protected async prompt(): Promise<string> {
    return "test value"
  }

  validate(value: string) {
    return this.getValidator()?.(value)
  }
}

describe("BaseValueStep", () => {
  const TEST_FIXTURES = {
    field: { key: "value", message: "Value" } satisfies Omit<
      CliPromptField,
      "type"
    >,
  }

  describe("when the prompt returns a value", () => {
    let result: Record<string, unknown>

    beforeEach(async () => {
      const step = new TestValueStep(TEST_FIXTURES.field)
      result = await step.run()
    })

    it("stores the value under the configured field key", () => {
      expect(result).toEqual({ value: "test value" })
    })
  })

  describe("when a schema is configured", () => {
    let step: TestValueStep

    beforeEach(() => {
      step = new TestValueStep({
        ...TEST_FIXTURES.field,
        schema: z.string().min(2),
      })
    })

    it("returns an error message for a value that violates the schema", () => {
      expect(step.validate("x")).toEqual(expect.any(String))
    })

    it("accepts a value that matches the schema", () => {
      expect(step.validate("valid")).toBe(true)
    })
  })
})
