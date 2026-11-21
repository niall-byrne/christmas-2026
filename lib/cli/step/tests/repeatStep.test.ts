import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CliStep } from "@/contracts/cli/step"
import { RepeatStep } from "@/lib/cli/step/repeatStep"

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }))
vi.mock("@inquirer/prompts", () => ({ confirm: confirmMock }))

describe("RepeatStep", () => {
  const TEST_FIXTURES = {
    key: "cards",
    confirm: { message: "Add another?", default: false },
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe("when the user requests multiple entries", () => {
    let result: Record<string, unknown>
    let consoleLogSpy: ReturnType<typeof vi.spyOn>

    beforeEach(async () => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      let value = 0
      const steps: CliStep[] = [
        { run: async () => ({ recipient: `Recipient ${++value}` }) },
        { run: async () => ({ identifier: `Identifier ${value}` }) },
      ]
      confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      const step = new RepeatStep({
        key: TEST_FIXTURES.key,
        steps,
        heading: (number) => `Entry ${number}`,
        minimumCount: 1,
        addAnother: TEST_FIXTURES.confirm,
      })
      result = await step.run()
    })

    it("groups each iteration's step outputs into a collection", () => {
      expect(result).toEqual({
        cards: [
          { recipient: "Recipient 1", identifier: "Identifier 1" },
          { recipient: "Recipient 2", identifier: "Identifier 2" },
        ],
      })
    })

    it("asks whether to add another entry after each iteration", () => {
      expect(confirmMock).toHaveBeenCalledTimes(2)
    })

    it("prints a heading for each entry", () => {
      expect(consoleLogSpy.mock.calls).toEqual([["Entry 1"], ["Entry 2"]])
    })
  })

  describe("when the minimum count exceeds one", () => {
    let result: Record<string, unknown>
    let consoleLogSpy: ReturnType<typeof vi.spyOn>

    beforeEach(async () => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const step = new RepeatStep({
        key: TEST_FIXTURES.key,
        steps: [{ run: async () => ({ value: "card" }) }],
        heading: (number) => `Entry ${number}`,
        minimumCount: 2,
        addAnother: TEST_FIXTURES.confirm,
      })
      confirmMock.mockResolvedValue(false)
      result = await step.run()
    })

    it("collects the required entries before returning", () => {
      expect(result).toEqual({
        cards: [{ value: "card" }, { value: "card" }],
      })
    })

    it("asks whether to add another after collecting the minimum", () => {
      expect(confirmMock).toHaveBeenCalledOnce()
    })

    it("prints a heading for each required entry", () => {
      expect(consoleLogSpy.mock.calls).toEqual([["Entry 1"], ["Entry 2"]])
    })
  })
})
