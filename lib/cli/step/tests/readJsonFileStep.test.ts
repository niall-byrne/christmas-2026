// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile: readFileMock }))

import { CliFileError } from "@/lib/cli/error/cliFileError"
import { ReadJsonFileStep } from "@/lib/cli/step/readJsonFileStep"

describe("ReadJsonFileStep", () => {
  const TEST_FIXTURES = {
    path: "/tmp/game.json",
    contents: '{"name":"Winter game"}',
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe("when a file path is configured", () => {
    describe("when the file contains valid JSON", () => {
      let result: Record<string, unknown>

      beforeEach(async () => {
        readFileMock.mockResolvedValue(TEST_FIXTURES.contents)
        const step = new ReadJsonFileStep({
          outputKey: "game",
          path: () => TEST_FIXTURES.path,
        })
        result = await step.run({})
      })

      it("reads the configured file using the configured encoding", () => {
        expect(readFileMock).toHaveBeenCalledWith(TEST_FIXTURES.path, "utf8")
      })

      it("returns the parsed value under the output key", () => {
        expect(result).toEqual({ game: { name: "Winter game" } })
      })
    })

    describe("when the file cannot be read", () => {
      let request: Promise<unknown>

      beforeEach(() => {
        readFileMock.mockRejectedValue(new Error("permission denied"))
        const step = new ReadJsonFileStep({
          outputKey: "game",
          path: () => TEST_FIXTURES.path,
        })
        request = step.run({}).catch((error: unknown) => error)
      })

      it("rejects with a CLI file error", async () => {
        await expect(request).resolves.toBeInstanceOf(CliFileError)
      })
    })

    describe("when the file contains invalid JSON", () => {
      let request: Promise<unknown>

      beforeEach(() => {
        readFileMock.mockResolvedValue("{")
        const step = new ReadJsonFileStep({
          outputKey: "game",
          path: () => TEST_FIXTURES.path,
        })
        request = step.run({}).catch((error: unknown) => error)
      })

      it("rejects with a CLI file error", async () => {
        await expect(request).resolves.toBeInstanceOf(CliFileError)
      })
    })
  })

  describe("when no file path is configured", () => {
    let result: Record<string, unknown>

    beforeEach(async () => {
      const step = new ReadJsonFileStep({
        outputKey: "game",
        path: () => undefined,
      })
      result = await step.run({})
    })

    it("returns no output", () => {
      expect(result).toEqual({})
    })

    it("does not read a file", () => {
      expect(readFileMock).not.toHaveBeenCalled()
    })
  })
})
