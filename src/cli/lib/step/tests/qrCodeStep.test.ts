// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mkdtempMock, tmpdirMock, toFileMock } = vi.hoisted(() => ({
  mkdtempMock: vi.fn(),
  tmpdirMock: vi.fn(),
  toFileMock: vi.fn(),
}))

vi.mock("node:fs/promises", () => ({ mkdtemp: mkdtempMock }))
vi.mock("node:os", () => ({ tmpdir: tmpdirMock }))
vi.mock("qrcode", () => ({ default: { toFile: toFileMock } }))

import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"
import { QrCodeStep } from "@/cli/lib/step/qrCodeStep"

describe("QrCodeStep", () => {
  const TEST_FIXTURES = {
    url: new URL("https://games.test/play/game"),
    options: {
      urlKey: "url",
      outputKey: "qrPath",
      fileName: () => "invite",
      temporaryDirectoryPrefix: "game-",
      width: 512,
      margin: 2,
    },
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe("when an output path is requested", () => {
    let result: Record<string, unknown>

    beforeEach(async () => {
      toFileMock.mockResolvedValue(undefined)
      const step = new QrCodeStep({
        ...TEST_FIXTURES.options,
        requestedPath: () => "/tmp/game.png",
      })
      result = await step.run({ url: TEST_FIXTURES.url })
    })

    it("writes the QR code to the requested path with configured dimensions", () => {
      expect(toFileMock).toHaveBeenCalledWith(
        "/tmp/game.png",
        TEST_FIXTURES.url.toString(),
        { width: 512, margin: 2 }
      )
    })

    it("returns the requested path under the configured output key", () => {
      expect(result).toEqual({ qrPath: "/tmp/game.png" })
    })

    it("does not create a temporary directory", () => {
      expect(mkdtempMock).not.toHaveBeenCalled()
    })
  })

  describe("when no output path is requested", () => {
    let result: Record<string, unknown>

    beforeEach(async () => {
      tmpdirMock.mockReturnValue("/tmp")
      mkdtempMock.mockResolvedValue("/tmp/game-abc")
      toFileMock.mockResolvedValue(undefined)
      const step = new QrCodeStep(TEST_FIXTURES.options)
      result = await step.run({ url: TEST_FIXTURES.url })
    })

    it("creates a temporary directory with the configured prefix", () => {
      expect(mkdtempMock).toHaveBeenCalledWith("/tmp/game-")
    })

    it("writes and returns a path inside the temporary directory", () => {
      expect(toFileMock).toHaveBeenCalledWith(
        "/tmp/game-abc/invite.png",
        TEST_FIXTURES.url.toString(),
        { width: 512, margin: 2 }
      )
      expect(result).toEqual({ qrPath: "/tmp/game-abc/invite.png" })
    })
  })

  describe("when the workflow URL value is not a URL", () => {
    let request: Promise<unknown>

    beforeEach(() => {
      const step = new QrCodeStep(TEST_FIXTURES.options)
      request = step
        .run({ url: TEST_FIXTURES.url.toString() })
        .catch((error: unknown) => error)
    })

    it("rejects with a CLI error", async () => {
      await expect(request).resolves.toBeInstanceOf(CliBaseError)
    })
  })
})
