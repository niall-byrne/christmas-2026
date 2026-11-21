import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OutputStep } from "@/lib/cli/step/outputStep"

describe("OutputStep", () => {
  const TEST_FIXTURES = { context: { gameId: "game-123" } }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("when output lines are configured", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>
    let result: Record<string, unknown>

    beforeEach(async () => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const step = new OutputStep({
        lines: [(context) => `Game: ${String(context.gameId)}`, () => "Ready"],
      })
      result = await step.run(TEST_FIXTURES.context)
    })

    it("prints each line using the current workflow context", () => {
      expect(consoleLogSpy.mock.calls).toEqual([["Game: game-123"], ["Ready"]])
    })

    it("returns no workflow outputs", () => {
      expect(result).toEqual({})
    })
  })

  describe("when no output lines are configured", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>
    let result: Record<string, unknown>

    beforeEach(async () => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const step = new OutputStep({ lines: [] })
      result = await step.run({})
    })

    it("does not print output", () => {
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it("returns no workflow outputs", () => {
      expect(result).toEqual({})
    })
  })
})
