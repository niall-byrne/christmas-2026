// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CreateGameResponse } from "@/contracts/game/api/data"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { DividerStep } from "@/cli/lib/step/dividerStep"
import { getTerminalWidth } from "@/cli/lib/util/terminal"

const {
  confirmMock,
  inputMock,
  mkdtempMock,
  openMock,
  passwordMock,
  readFileMock,
  tmpdirMock,
  toFileMock,
} = vi.hoisted(() => ({
  confirmMock: vi.fn(),
  inputMock: vi.fn(),
  mkdtempMock: vi.fn(),
  openMock: vi.fn(),
  passwordMock: vi.fn(),
  readFileMock: vi.fn(),
  tmpdirMock: vi.fn(),
  toFileMock: vi.fn(),
}))

vi.mock("node:fs/promises", () => ({
  mkdtemp: mkdtempMock,
  readFile: readFileMock,
}))

vi.mock("node:os", () => ({
  tmpdir: tmpdirMock,
}))

vi.mock("@inquirer/prompts", () => ({
  confirm: confirmMock,
  input: inputMock,
  password: passwordMock,
}))

vi.mock("open", () => ({
  apps: { browser: "test-browser" },
  default: openMock,
}))

vi.mock("qrcode", () => ({
  default: { toFile: toFileMock },
}))

import { CreateGameCommand } from "@/cli/commands/create-game/index"

describe("create-game integration", () => {
  const TEST_FIXTURES = {
    args: ["--file", "./games/family.json"],
    game: {
      name: "Christmas Card Showdown",
      password: "rudolph & friends",
      bonusCard: "Gold Crown",
      cards: [
        { recipient: "Alice", identifier: "Gold Star" },
        { recipient: "Bob", identifier: "Pine Tree" },
      ],
    },
    gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
    host: "https://games.example.test",
    tempDirectory: "/tmp/christmas-game-test",
    tmpdir: "/tmp",
  } as const

  let fetchMock: ReturnType<typeof vi.fn>
  let command: CreateGameCommand
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    command = new CreateGameCommand()
    vi.stubEnv("HOST", TEST_FIXTURES.host)
    vi.stubEnv("LOG_LEVEL", "silent")
    vi.spyOn(process, "loadEnvFile").mockImplementation(() => undefined)
    inputMock.mockResolvedValue("")
    passwordMock.mockResolvedValue("")
    confirmMock.mockResolvedValue(false)
    vi.stubGlobal("fetch", vi.fn())
    fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockImplementation(async () =>
      Response.json(
        {
          gameId: TEST_FIXTURES.gameId,
          name: TEST_FIXTURES.game.name,
          level: 0,
        } satisfies CreateGameResponse,
        { status: 201 }
      )
    )
    readFileMock.mockResolvedValue(JSON.stringify(TEST_FIXTURES.game))
    tmpdirMock.mockReturnValue(TEST_FIXTURES.tmpdir)
    mkdtempMock.mockResolvedValue(TEST_FIXTURES.tempDirectory)
    toFileMock.mockResolvedValue(undefined)
    openMock.mockResolvedValue(undefined)
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe("when neither HOST nor --url is configured", () => {
    let exitCode: number

    beforeEach(async () => {
      vi.stubEnv("HOST", "")
      exitCode = await command.run([])
    })

    it("rejects an unset target origin with exit code 1", () => {
      expect(exitCode).toBe(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "HOST environment variable or --url flag is required"
      )
    })

    it("does not send a request without a target origin", () => {
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe("when --url overrides HOST", () => {
    let exitCode: number

    beforeEach(async () => {
      exitCode = await command.run([
        ...TEST_FIXTURES.args,
        "--url",
        "https://override.example.test",
      ])
    })

    it("posts the validated game to the versioned create endpoint", () => {
      expect(exitCode).toBe(0)
      expect(fetchMock).toHaveBeenCalledWith(
        new URL("https://override.example.test/api/v1/games"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(TEST_FIXTURES.game),
        })
      )
    })
  })

  describe("when the input file contains malformed JSON", () => {
    let exitCode: number

    beforeEach(async () => {
      readFileMock.mockResolvedValue("{")
      exitCode = await command.run(TEST_FIXTURES.args)
    })

    it("reports the JSON parse error", () => {
      expect(exitCode).toBe(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid JSON in ./games/family.json")
      )
    })

    it("does not send a request for malformed JSON", () => {
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe("when the input file cannot be read", () => {
    let exitCode: number

    beforeEach(async () => {
      readFileMock.mockRejectedValue(new Error("permission denied"))
      exitCode = await command.run(TEST_FIXTURES.args)
    })

    it("reports the file read error", () => {
      expect(exitCode).toBe(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Unable to read ./games/family.json: permission denied"
      )
    })

    it("does not send a request when the file cannot be read", () => {
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe("when the input does not match the game creation schema", () => {
    let exitCode: number

    beforeEach(async () => {
      readFileMock.mockResolvedValue(
        JSON.stringify({ ...TEST_FIXTURES.game, cards: [] })
      )
      exitCode = await command.run(TEST_FIXTURES.args)
    })

    it("reports the schema validation message", () => {
      expect(exitCode).toBe(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("cards: Invalid cards")
      )
    })

    it("does not send a request for invalid game data", () => {
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe("when the game is created successfully", () => {
    let exitCode: number

    beforeEach(async () => {
      exitCode = await command.run(TEST_FIXTURES.args)
    })

    it("posts the creation request using HOST as the default origin", () => {
      expect(exitCode).toBe(0)
      expect(fetchMock).toHaveBeenCalledWith(
        new URL(`${TEST_FIXTURES.host}/api/v1/games`),
        expect.objectContaining({ method: "POST" })
      )
    })

    it("encodes the password in the generated join QR code", () => {
      const joinUrl = new URL(
        `https://games.example.test/play/game/${TEST_FIXTURES.gameId}`
      )
      joinUrl.searchParams.set("password", TEST_FIXTURES.game.password)

      expect(exitCode).toBe(0)
      expect(mkdtempMock).toHaveBeenCalledWith("/tmp/christmas-game-")
      expect(toFileMock).toHaveBeenCalledWith(
        `${TEST_FIXTURES.tempDirectory}/${TEST_FIXTURES.gameId}.png`,
        joinUrl.toString(),
        { width: 512, margin: 2 }
      )
    })

    it("opens the generated PNG in the default browser", () => {
      expect(exitCode).toBe(0)
      expect(openMock).toHaveBeenCalledWith(
        `${TEST_FIXTURES.tempDirectory}/${TEST_FIXTURES.gameId}.png`,
        { app: { name: "test-browser" } }
      )
    })

    it("prints the game ID, QR path, and join URL", () => {
      const joinUrl = new URL(
        `https://games.example.test/play/game/${TEST_FIXTURES.gameId}`
      )
      joinUrl.searchParams.set("password", TEST_FIXTURES.game.password)

      expect(exitCode).toBe(0)
      expect(consoleLogSpy).toHaveBeenCalledWith("Your game is ready!")
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `Game ID: ${TEST_FIXTURES.gameId}`
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `Your join QR code is ready to print: ${TEST_FIXTURES.tempDirectory}/${TEST_FIXTURES.gameId}.png`
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `Players can also join here: ${joinUrl.toString()}`
      )
    })
  })

  describe("when no --file option is provided", () => {
    let exitCode: number

    beforeEach(async () => {
      inputMock
        .mockResolvedValueOnce(TEST_FIXTURES.game.name)
        .mockResolvedValueOnce(TEST_FIXTURES.game.bonusCard)
        .mockResolvedValueOnce(TEST_FIXTURES.game.cards[0].recipient)
        .mockResolvedValueOnce(TEST_FIXTURES.game.cards[0].identifier)
        .mockResolvedValueOnce(TEST_FIXTURES.game.cards[1].recipient)
        .mockResolvedValueOnce(TEST_FIXTURES.game.cards[1].identifier)
      passwordMock.mockResolvedValueOnce(TEST_FIXTURES.game.password)
      confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      exitCode = await command.run([])
    })

    it("prompts for each required game field", () => {
      expect(exitCode).toBe(0)
      expect(inputMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Enter the game's name:",
        })
      )
      expect(passwordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Enter a password for your game:",
          mask: "*",
        })
      )
      expect(inputMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "The prize will be a bonus card, what identifies it:",
        })
      )
      expect(inputMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "What is the recipient's name:",
        })
      )
      expect(inputMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "What identifies this card:",
        })
      )
      expect(confirmMock).toHaveBeenCalledWith({
        message: "Add another card?",
        default: false,
      })
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        "Let's setup a new game..."
      )
      expect(consoleLogSpy).toHaveBeenCalledWith("Card #1")
      expect(consoleLogSpy).toHaveBeenCalledWith("Card #2")
    })

    it("sizes each divider to the terminal width", () => {
      const expectedWidth = getTerminalWidth(
        process.stdout.columns,
        DividerStep.DEFAULT_WIDTH
      )
      const dividers: string[] = consoleLogSpy.mock.calls
        .map((call: unknown[]) => call[0])
        .filter(
          (message: unknown): message is string =>
            typeof message === "string" &&
            message.length > 0 &&
            message.split("").every((character) => character === "=")
        )

      expect(dividers.length).toBeGreaterThan(0)
      expect(
        dividers.every((divider: string) => divider.length === expectedWidth)
      ).toBe(true)
    })

    it("posts the prompted game data to the configured HOST", () => {
      expect(exitCode).toBe(0)
      expect(fetchMock).toHaveBeenCalledWith(
        new URL(`${TEST_FIXTURES.host}/api/v1/games`),
        expect.objectContaining({
          body: JSON.stringify(TEST_FIXTURES.game),
        })
      )
    })
  })

  describe("when --out specifies a QR code path", () => {
    let exitCode: number

    beforeEach(async () => {
      exitCode = await command.run([
        ...TEST_FIXTURES.args,
        "--out",
        "./print/game.png",
      ])
    })

    it("writes the QR code to the requested path", () => {
      expect(exitCode).toBe(0)
      expect(mkdtempMock).not.toHaveBeenCalled()
      expect(toFileMock).toHaveBeenCalledWith(
        "./print/game.png",
        expect.any(String),
        { width: 512, margin: 2 }
      )
    })
  })

  describe.each([
    [400, ApiErrorCode.INVALID_GAME_CARDS, "Invalid cards"],
    [429, ApiErrorCode.RATE_LIMITED, "Too many requests"],
    [500, ApiErrorCode.INTERNAL_SERVER_ERROR, "Internal server error"],
  ])("when the API responds with HTTP %i", (status, error, message) => {
    let exitCode: number

    beforeEach(async () => {
      fetchMock.mockResolvedValue(Response.json({ error, message }, { status }))
      exitCode = await command.run(TEST_FIXTURES.args)
    })

    it("prints the API error and returns exit code 1", () => {
      expect(exitCode).toBe(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Game creation failed with HTTP ${status}: ${error}: ${message}`
      )
      expect(toFileMock).not.toHaveBeenCalled()
    })
  })

  describe("when the network request fails", () => {
    let exitCode: number

    beforeEach(async () => {
      fetchMock.mockRejectedValue(new Error("connection refused"))
      exitCode = await command.run(TEST_FIXTURES.args)
    })

    it("reports the network error and returns exit code 1", () => {
      expect(exitCode).toBe(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith("connection refused")
      expect(toFileMock).not.toHaveBeenCalled()
    })
  })
})
