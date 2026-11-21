import { beforeEach, describe, expect, it, vi } from "vitest"
import { TransformStep } from "@/cli/lib/step/transformStep"

describe("TransformStep", () => {
  const TEST_FIXTURES = { context: { name: "  Winter game  " } }

  describe("when the transform produces a normalized value", () => {
    let transform: (context: Readonly<Record<string, unknown>>) => unknown
    let result: Record<string, unknown>

    beforeEach(async () => {
      transform = vi.fn(async (context: Readonly<Record<string, unknown>>) => ({
        normalizedName: String(context.name).trim(),
      }))
      const step = new TransformStep({
        outputKey: "normalized",
        transform,
      })
      result = await step.run(TEST_FIXTURES.context)
    })

    it("stores the transform result under the configured output key", () => {
      expect(result).toEqual({
        normalized: { normalizedName: "Winter game" },
      })
    })

    it("provides the workflow context to the transform", () => {
      expect(transform).toHaveBeenCalledWith(TEST_FIXTURES.context)
    })
  })
})
