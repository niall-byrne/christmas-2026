import type { CliPromptConfig, CliStep } from "@/contracts/cli/step"

export type CliExitCode = 0 | 1

export interface CliCommand {
  run(args: readonly string[]): Promise<CliExitCode>
}

export interface CliCommandConfig<
  OptionMap extends Readonly<Record<string, string>> = Readonly<
    Record<string, string>
  >,
> {
  readonly usage: string
  readonly optionMap: OptionMap
  readonly environmentFiles: readonly string[]
  readonly workflowSteps?: readonly CliStep[]
  readonly interactivePromptConfig?: CliPromptConfig & {
    readonly whenOptionMissing?: string
  }
}

export type CliCommandOptions<Config extends CliCommandConfig> = Partial<
  Record<Config["optionMap"][keyof Config["optionMap"]], string>
>
