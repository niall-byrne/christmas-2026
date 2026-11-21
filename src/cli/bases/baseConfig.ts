import type { CliCommandConfig } from "@/contracts/cli/command"
import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"

export abstract class BaseCliConfig implements CliCommandConfig {
  abstract readonly usage: string
  abstract readonly optionMap: Readonly<Record<string, string>>
  abstract readonly environmentFiles: readonly string[]

  protected getContextRecord(
    context: Readonly<Record<string, unknown>>,
    key: string
  ): Readonly<Record<string, unknown>> {
    const value = context[key]
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new CliBaseError(`Cannot read workflow record: ${key}`)
    }
    return value as Readonly<Record<string, unknown>>
  }

  protected getContextString(
    context: Readonly<Record<string, unknown>>,
    key: string
  ): string {
    const value = context[key]
    if (typeof value !== "string") {
      throw new CliBaseError(`Cannot read workflow value: ${key}`)
    }
    return value
  }

  protected getOption(
    context: Readonly<Record<string, unknown>>,
    key: string
  ): string | undefined {
    const value = this.getContextRecord(context, "options")[key]
    if (value === undefined) {
      return undefined
    }
    if (typeof value !== "string") {
      throw new CliBaseError(`Invalid command option: ${key}`)
    }
    return value
  }
}
