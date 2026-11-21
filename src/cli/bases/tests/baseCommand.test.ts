// @vitest-environment node

import { existsSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CliCommandConfig } from "@/contracts/cli/command"
import type { CliPromptConfig, CliStep } from "@/contracts/cli/step"
import { ConfigDrivenCliCommand } from "@/cli/bases/baseCommand"

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}))

class TestCommand extends ConfigDrivenCliCommand<CliCommandConfig> {
  constructor(config: CliCommandConfig) {
    super(config)
  }

  parse(args: readonly string[]): Partial<Record<string, string>> {
    return this.parseArguments(args)
  }

  loadEnv() {
    return this.loadEnvironment()
  }

  collect(options: Record<string, string>) {
    return this.collectPromptAnswers(options)
  }

  prompt(config: CliPromptConfig) {
    return this.runPrompt(config)
  }

  steps(
    configuredSteps: readonly CliStep[],
    initialContext?: Record<string, unknown>
  ) {
    return this.runSteps(configuredSteps, initialContext)
  }

  executeWorkflow(
    options: Record<string, string>,
    answers: Record<string, unknown>
  ) {
    return this.execute(options, answers)
  }
}

describe("ConfigDrivenCliCommand", () => {
  const TEST_FIXTURES = {
    usage: "Usage: test [--file <path>] [--url <origin>]",
    options: { "--file": "file", "--url": "url" },
    gameFile: "./game.json",
    origin: "https://games.example.test",
  } as const

  let command: TestCommand
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.mocked(existsSync).mockReset().mockReturnValue(false)
    command = new TestCommand({
      usage: TEST_FIXTURES.usage,
      optionMap: TEST_FIXTURES.options,
      environmentFiles: [],
    })
    vi.spyOn(process, "loadEnvFile").mockImplementation(() => undefined)
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("when parsing command arguments", () => {
    describe("when all options have values", () => {
      let parsed: Partial<Record<string, string>>

      beforeEach(() => {
        parsed = command.parse([
          "--file",
          TEST_FIXTURES.gameFile,
          "--url",
          TEST_FIXTURES.origin,
        ])
      })

      it("maps recognized flags to their configured option keys", () => {
        expect(parsed).toEqual({
          file: TEST_FIXTURES.gameFile,
          url: TEST_FIXTURES.origin,
        })
      })
    })

    describe("when an unknown option is provided", () => {
      let error: Error | undefined

      beforeEach(() => {
        try {
          command.parse(["--other", "value"])
        } catch (caught) {
          error = caught as Error
        }
      })

      it("reports the option and command usage", () => {
        expect(error?.message).toBe(
          `Unknown option: --other\n${TEST_FIXTURES.usage}`
        )
      })
    })

    describe.each([
      { description: "no value", args: ["--file"] },
      { description: "an empty value", args: ["--file", ""] },
      {
        description: "another option as its value",
        args: ["--file", "--url", TEST_FIXTURES.origin],
      },
    ])("when an option has $description", ({ args }) => {
      let error: Error | undefined

      beforeEach(() => {
        try {
          command.parse(args)
        } catch (caught) {
          error = caught as Error
        }
      })

      it("reports the missing value and command usage", () => {
        expect(error?.message).toBe(
          `Missing value for --file\n${TEST_FIXTURES.usage}`
        )
      })
    })

    describe("when an option is repeated", () => {
      let error: Error | undefined

      beforeEach(() => {
        try {
          command.parse(["--file", "./first.json", "--file", "./second.json"])
        } catch (caught) {
          error = caught as Error
        }
      })

      it("reports the repeated flag and command usage", () => {
        expect(error?.message).toBe(
          `Option --file can only be used once\n${TEST_FIXTURES.usage}`
        )
      })
    })
  })

  describe("when loading environment files", () => {
    describe("when only some configured files exist", () => {
      let environmentCommand: TestCommand

      beforeEach(() => {
        vi.mocked(existsSync)
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(false)
        environmentCommand = new TestCommand({
          usage: TEST_FIXTURES.usage,
          optionMap: TEST_FIXTURES.options,
          environmentFiles: [".env.local", ".env"],
        })
        environmentCommand.loadEnv()
      })

      it("loads existing files and skips missing files", () => {
        expect(existsSync).toHaveBeenNthCalledWith(1, ".env.local")
        expect(existsSync).toHaveBeenNthCalledWith(2, ".env")
        expect(process.loadEnvFile).toHaveBeenCalledOnce()
        expect(process.loadEnvFile).toHaveBeenCalledWith(".env.local")
      })
    })
  })

  describe("when collecting prompt answers", () => {
    describe("when no prompt configuration is set", () => {
      let answers: Record<string, unknown>

      beforeEach(async () => {
        answers = await command.collect({})
      })

      it("returns an empty answer record", () => {
        expect(answers).toEqual({})
      })
    })

    describe("when the option that controls prompting is present", () => {
      let answers: Record<string, unknown>

      beforeEach(async () => {
        const promptedCommand = new TestCommand({
          usage: TEST_FIXTURES.usage,
          optionMap: TEST_FIXTURES.options,
          environmentFiles: [],
          interactivePromptConfig: {
            whenOptionMissing: "file",
            steps: [],
          },
        })
        answers = await promptedCommand.collect({
          file: TEST_FIXTURES.gameFile,
        })
      })

      it("skips the configured prompt", () => {
        expect(answers).toEqual({})
      })
    })

    describe("when the option that controls prompting is absent", () => {
      let answers: Record<string, unknown>
      let promptStep: CliStep

      beforeEach(async () => {
        promptStep = {
          run: vi.fn(async () => ({ name: "Winter game" })),
        }
        const promptedCommand = new TestCommand({
          usage: TEST_FIXTURES.usage,
          optionMap: TEST_FIXTURES.options,
          environmentFiles: [],
          interactivePromptConfig: {
            whenOptionMissing: "file",
            introduction: "Let's begin",
            steps: [promptStep],
          },
        })
        answers = await promptedCommand.collect({})
      })

      it("returns the answers produced by prompt steps", () => {
        expect(answers).toEqual({ name: "Winter game" })
      })

      it("prints the configured prompt introduction", () => {
        expect(consoleLogSpy).toHaveBeenCalledWith("Let's begin")
      })

      it("runs the prompt step with the shared workflow context", () => {
        expect(promptStep.run).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Winter game" })
        )
      })
    })
  })

  describe("when running steps", () => {
    describe("when one step produces output for the next step", () => {
      let context: Record<string, unknown>
      let secondStep: CliStep

      beforeEach(async () => {
        const firstStep: CliStep = {
          run: vi.fn(async () => ({ name: "Winter game" })),
        }
        secondStep = {
          run: vi.fn(async (stepContext) => ({
            greeting: `Hello ${stepContext.name}`,
          })),
        }
        context = await command.steps([firstStep, secondStep])
      })

      it("merges the output from each step into the final context", () => {
        expect(context).toEqual({
          name: "Winter game",
          greeting: "Hello Winter game",
        })
      })

      it("passes prior step output to the following step", () => {
        expect(secondStep.run).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Winter game" })
        )
      })
    })

    describe("when an initial context is provided", () => {
      let context: Record<string, unknown>

      beforeEach(async () => {
        const step: CliStep = {
          run: vi.fn(async (stepContext) => ({
            result: stepContext.input,
          })),
        }
        context = await command.steps([step], { input: "initial value" })
      })

      it("preserves initial values and merges step output", () => {
        expect(context).toEqual({
          input: "initial value",
          result: "initial value",
        })
      })
    })
  })

  describe("when executing workflow steps", () => {
    describe("when no workflow steps are configured", () => {
      let execution: Promise<void>

      beforeEach(() => {
        execution = command.executeWorkflow({}, {})
      })

      it("rejects with a configuration error", async () => {
        await expect(execution).rejects.toThrow(
          "No workflow steps are configured for this command"
        )
      })
    })

    describe("when workflow steps are configured", () => {
      let step: CliStep
      let execution: Promise<void>

      beforeEach(() => {
        step = {
          run: vi.fn(async (context) => ({
            result: {
              options: context.options,
              promptAnswers: context.promptAnswers,
            },
          })),
        }
        const workflowCommand = new TestCommand({
          usage: TEST_FIXTURES.usage,
          optionMap: TEST_FIXTURES.options,
          environmentFiles: [],
          workflowSteps: [step],
        })
        execution = workflowCommand.executeWorkflow(
          { file: TEST_FIXTURES.gameFile },
          { name: "Winter game" }
        )
      })

      it("passes options and prompt answers into workflow context", async () => {
        await expect(execution).resolves.toBeUndefined()
        expect(step.run).toHaveBeenCalledWith(
          expect.objectContaining({
            options: { file: TEST_FIXTURES.gameFile },
            promptAnswers: { name: "Winter game" },
          })
        )
      })
    })
  })

  describe("when running the command", () => {
    describe("when the workflow completes", () => {
      let result: number

      beforeEach(async () => {
        const workflowCommand = new TestCommand({
          usage: TEST_FIXTURES.usage,
          optionMap: TEST_FIXTURES.options,
          environmentFiles: [],
          workflowSteps: [{ run: vi.fn(async () => ({})) }],
        })
        result = await workflowCommand.run([])
      })

      it("returns exit code zero", () => {
        expect(result).toBe(0)
      })
    })

    describe("when argument parsing throws a CLI error", () => {
      let result: number

      beforeEach(async () => {
        result = await command.run(["--unknown"])
      })

      it("returns the CLI error exit code", () => {
        expect(result).toBe(1)
      })

      it("prints the CLI error message", () => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          `Unknown option: --unknown\n${TEST_FIXTURES.usage}`
        )
      })
    })

    describe("when a workflow step throws a standard error", () => {
      let result: number

      beforeEach(async () => {
        const workflowCommand = new TestCommand({
          usage: TEST_FIXTURES.usage,
          optionMap: TEST_FIXTURES.options,
          environmentFiles: [],
          workflowSteps: [
            {
              run: vi.fn(async () => {
                throw new Error("unexpected workflow error")
              }),
            },
          ],
        })
        result = await workflowCommand.run([])
      })

      it("converts the error to the CLI exit code", () => {
        expect(result).toBe(1)
      })

      it("prints the unexpected error message", () => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "unexpected workflow error"
        )
      })
    })
  })
})
