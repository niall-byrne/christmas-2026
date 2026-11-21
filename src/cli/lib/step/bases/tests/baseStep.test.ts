import { beforeEach, describe, expect, it } from "vitest"
import type { CliStep } from "@/contracts/cli/step"
import { BaseStep } from "@/cli/lib/step/bases/baseStep"

class TestStep extends BaseStep {
  async run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    return { result: context.value }
  }
}

describe("BaseStep", () => {
  const TEST_FIXTURES = { value: "test value" }

  describe("when a concrete step implements run", () => {
    let step: CliStep

    beforeEach(() => {
      step = new TestStep()
    })

    it("fulfills the CliStep contract", async () => {
      await expect(step.run(TEST_FIXTURES)).resolves.toEqual({
        result: TEST_FIXTURES.value,
      })
    })
  })
})
