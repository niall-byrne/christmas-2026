import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"
import { OpenFileStep } from "@/lib/cli/step/openFileStep"

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }))
vi.mock("open", () => ({
  apps: { browser: "test-browser" },
  default: openMock,
}))

describe("OpenFileStep", () => {
  const TEST_FIXTURES = { path: "/tmp/game.png" }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe("when the workflow contains the configured file path", () => {
    let result: Record<string, unknown>

    beforeEach(async () => {
      openMock.mockResolvedValue(undefined)
      const step = new OpenFileStep("filePath")
      result = await step.run({ filePath: TEST_FIXTURES.path })
    })

    it("opens the configured path in the browser", () => {
      expect(openMock).toHaveBeenCalledWith(TEST_FIXTURES.path, {
        app: { name: "test-browser" },
      })
    })

    it("returns no workflow outputs", () => {
      expect(result).toEqual({})
    })
  })

  describe("when the workflow file path is missing", () => {
    let error: unknown

    beforeEach(async () => {
      const step = new OpenFileStep("filePath")
      try {
        await step.run({})
      } catch (caught) {
        error = caught
      }
    })

    it("rejects with a CLI error", () => {
      expect(error).toBeInstanceOf(CliBaseError)
    })

    it("does not open a file", () => {
      expect(openMock).not.toHaveBeenCalled()
    })
  })
})
