import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TextStep } from "@/lib/cli/step/textStep"

describe("TextStep", () => {
  const TEST_FIXTURES = { text: "Enter game details" }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("when the text step runs", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>
    let result: Record<string, unknown>

    beforeEach(async () => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const step = new TextStep(TEST_FIXTURES.text)
      result = await step.run()
    })

    it("prints the configured text", () => {
      expect(consoleLogSpy).toHaveBeenCalledWith(TEST_FIXTURES.text)
    })

    it("returns no workflow outputs", () => {
      expect(result).toEqual({})
    })
  })
})
