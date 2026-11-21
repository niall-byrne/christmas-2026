import { existsSync } from "node:fs"
import type {
  CliCommand,
  CliCommandConfig,
  CliCommandOptions,
  CliExitCode,
} from "@/contracts/cli/command"
import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"
import { CliArgumentError } from "@/cli/lib/error/cliArgumentError"
import type { CliPromptConfig, CliStep } from "@/contracts/cli/step"

export abstract class ConfigDrivenCliCommand<
  Config extends CliCommandConfig,
> implements CliCommand {
  protected constructor(protected readonly config: Config) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    try {
      this.loadEnvironment()
      const options = this.parseArguments(args)
      const promptAnswers = await this.collectPromptAnswers(options)
      await this.execute(options, promptAnswers)
      return 0
    } catch (error) {
      const cliError = CliBaseError.from(error)
      console.error(cliError.message)
      return cliError.exitCode
    }
  }

  protected loadEnvironment(): void {
    for (const file of this.config.environmentFiles) {
      if (existsSync(file)) {
        process.loadEnvFile(file)
      }
    }
  }

  protected parseArguments(args: readonly string[]): CliCommandOptions<Config> {
    const parsed: Record<string, string> = {}

    for (let index = 0; index < args.length; index += 1) {
      const flag = args[index]
      const option = this.config.optionMap[flag]
      if (typeof option !== "string") {
        throw CliArgumentError.unknownOption(flag, this.config.usage)
      }

      const value = args[index + 1]
      if (!value || value.startsWith("--")) {
        throw CliArgumentError.missingValue(flag, this.config.usage)
      }
      if (Object.hasOwn(parsed, option)) {
        throw CliArgumentError.repeatedOption(flag, this.config.usage)
      }

      parsed[option] = value
      index += 1
    }

    return parsed as CliCommandOptions<Config>
  }

  protected async collectPromptAnswers(
    options: CliCommandOptions<Config>
  ): Promise<Record<string, unknown>> {
    const prompt = this.config.interactivePromptConfig
    if (
      !prompt ||
      (prompt.whenOptionMissing !== undefined &&
        Object.hasOwn(options, prompt.whenOptionMissing))
    ) {
      return {}
    }

    return this.runPrompt(prompt)
  }

  protected async runPrompt(
    prompt: CliPromptConfig
  ): Promise<Record<string, unknown>> {
    if (prompt.introduction !== undefined) {
      console.log(prompt.introduction)
    }

    return this.runSteps(prompt.steps)
  }

  protected async runSteps(
    steps: readonly CliStep[],
    initialContext: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    const context = { ...initialContext }

    for (const step of steps) {
      Object.assign(context, await step.run(context))
    }

    return context
  }

  protected async execute(
    options: CliCommandOptions<Config>,
    promptAnswers: Record<string, unknown>
  ): Promise<void> {
    if (!this.config.workflowSteps) {
      throw new CliBaseError(
        "No workflow steps are configured for this command"
      )
    }

    const context = {
      options: { ...options },
      promptAnswers,
    }
    await this.runSteps(this.config.workflowSteps, context)
  }
}
