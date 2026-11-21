// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ConfigDrivenCliCommand } from "@/cli/commands/bases/baseCommand"
import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"
import { TextStep } from "@/cli/lib/step/textStep"
import type {
  CliCommandConfig,
  CliCommandOptions,
  CliExitCode,
} from "@/contracts/cli/command"

const { existsSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
}))
vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}))

const TEST_CONFIG = {
  usage: "Usage: test-command [--file <path>] [--url <origin>]",
  optionMap: { "--file": "file", "--url": "url" },
  environmentFiles: [".env.local", ".env"],
  interactivePromptConfig: {
    whenOptionMissing: "file",
    steps: [new TextStep("Configured prompt")],
  },
} as const satisfies CliCommandConfig

type TestOptions = CliCommandOptions<typeof TEST_CONFIG>

class TestCommand extends ConfigDrivenCliCommand<typeof TEST_CONFIG> {
  executedOptions?: TestOptions
  executedPromptAnswers?: Record<string, unknown>
  executionError?: unknown

  constructor() {
    super(TEST_CONFIG)
  }

  protected async execute(
    options: TestOptions,
    promptAnswers: Record<string, unknown>
  ): Promise<void> {
    if (this.executionError !== undefined) {
      throw this.executionError
    }
    this.executedOptions = options
    this.executedPromptAnswers = promptAnswers
  }
}

describe("ConfigDrivenCliCommand", () => {
  const TEST_FIXTURES = {
    args: ["--file", "game.json", "--url", "https://games.test"],
    environmentFiles: [".env.local", ".env"],
    promptArgs: ["--url", "https://games.test"],
    workflowArgs: ["--file", "game.json"],
    file: "game.json",
  }

  let command: TestCommand
  let exitCode: CliExitCode
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let loadEnvFileSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    existsSyncMock.mockReturnValue(true)
    command = new TestCommand()
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    loadEnvFileSpy = vi
      .spyOn(process, "loadEnvFile")
      .mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe("when valid arguments are provided", () => {
    beforeEach(async () => {
      exitCode = await command.run(TEST_FIXTURES.args)
    })

    it("loads environment files in configuration order", () => {
      expect(loadEnvFileSpy.mock.calls).toEqual([
        [TEST_FIXTURES.environmentFiles[0]],
        [TEST_FIXTURES.environmentFiles[1]],
      ])
    })

    it("passes parsed options to the command implementation", () => {
      expect(command.executedOptions).toEqual({
        file: "game.json",
        url: "https://games.test",
      })
    })

    it("returns exit code zero", () => {
      expect(exitCode).toBe(0)
    })

    it("skips configured prompts when the configured option is supplied", () => {
      expect(consoleLogSpy).not.toHaveBeenCalledWith("Configured prompt")
    })
  })

  describe("when the option that controls prompting is absent", () => {
    let concreteCommand: TestCommand
    let result: CliExitCode

    beforeEach(async () => {
      concreteCommand = new TestCommand()
      result = await concreteCommand.run(TEST_FIXTURES.promptArgs)
    })

    it("returns exit code zero", () => {
      expect(result).toBe(0)
    })

    it("runs the configured prompt", () => {
      expect(consoleLogSpy).toHaveBeenCalledWith("Configured prompt")
    })

    it("passes empty prompt answers to command execution", () => {
      expect(concreteCommand.executedPromptAnswers).toEqual({})
    })
  })

  describe("when workflow steps are configured", () => {
    let result: CliExitCode
    let receivedContext: Readonly<Record<string, unknown>> | undefined

    beforeEach(async () => {
      const pipelineConfig = {
        ...TEST_CONFIG,
        workflowSteps: [
          {
            run: async (context: Readonly<Record<string, unknown>>) => {
              receivedContext = context
              return { value: "first" }
            },
          },
          {
            run: async (context: Readonly<Record<string, unknown>>) => ({
              previousValue: context.value,
            }),
          },
        ],
      } as const satisfies CliCommandConfig
      class PipelineCommand extends ConfigDrivenCliCommand<
        typeof pipelineConfig
      > {
        constructor() {
          super(pipelineConfig)
        }
      }

      result = await new PipelineCommand().run(TEST_FIXTURES.workflowArgs)
    })

    it("returns exit code zero", () => {
      expect(result).toBe(0)
    })

    it("passes parsed options and sequential step output through the context", () => {
      expect(receivedContext).toEqual({
        options: { file: TEST_FIXTURES.file },
        promptAnswers: {},
        value: "first",
        previousValue: "first",
      })
    })
  })

  describe("when an unknown option is provided", () => {
    beforeEach(async () => {
      exitCode = await command.run(["--unknown"])
    })

    it("returns exit code one", () => {
      expect(exitCode).toBe(1)
    })

    it("reports the usage error", () => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Unknown option: --unknown\n${TEST_CONFIG.usage}`
      )
    })
  })

  describe("when an option value is missing", () => {
    beforeEach(async () => {
      exitCode = await command.run(["--file"])
    })

    it("returns exit code one", () => {
      expect(exitCode).toBe(1)
    })

    it("reports the missing value", () => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Missing value for --file\n${TEST_CONFIG.usage}`
      )
    })
  })

  describe("when an option is repeated", () => {
    beforeEach(async () => {
      exitCode = await command.run([
        "--file",
        "first.json",
        "--file",
        "second.json",
      ])
    })

    it("returns exit code one", () => {
      expect(exitCode).toBe(1)
    })

    it("reports the repeated option", () => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Option --file can only be used once\n${TEST_CONFIG.usage}`
      )
    })
  })

  describe("when command execution throws a non-Error value", () => {
    beforeEach(async () => {
      command.executionError = { message: "unexpected" }
      exitCode = await command.run([])
    })

    it("returns exit code one", () => {
      expect(exitCode).toBe(1)
    })

    it("prints the string representation of the thrown value", () => {
      expect(consoleErrorSpy).toHaveBeenCalledWith("[object Object]")
    })

    it("converts the thrown value to a CLI error", () => {
      expect(CliBaseError.from(command.executionError)).toBeInstanceOf(
        CliBaseError
      )
    })
  })
})
