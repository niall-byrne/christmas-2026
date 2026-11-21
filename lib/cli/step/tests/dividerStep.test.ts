import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DividerStep } from "@/lib/cli/step/dividerStep"

describe("DividerStep", () => {
  const TEST_FIXTURES = { defaultCharacter: "=", defaultWidth: 80 }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("when reading the default class attributes", () => {
    let defaultCharacter: string
    let defaultWidth: number

    beforeEach(() => {
      defaultCharacter = DividerStep.DEFAULT_CHARACTER
      defaultWidth = DividerStep.DEFAULT_WIDTH
    })

    it("uses the expected default divider character", () => {
      expect(defaultCharacter).toBe(TEST_FIXTURES.defaultCharacter)
    })

    it("uses the expected default divider width", () => {
      expect(defaultWidth).toBe(TEST_FIXTURES.defaultWidth)
    })
  })

  describe("when a divider step runs", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>
    let result: Record<string, unknown>

    beforeEach(async () => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const step = new DividerStep()
      result = await step.run()
    })

    it("returns no workflow outputs", () => {
      expect(result).toEqual({})
    })

    it("prints one divider line", () => {
      expect(consoleLogSpy).toHaveBeenCalledOnce()
      expect(consoleLogSpy.mock.calls[0][0]).toMatch(/^=+$/)
    })
  })
})
