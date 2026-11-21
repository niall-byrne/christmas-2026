import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"

export class CliArgumentError extends CliBaseError {
  static unknownOption(flag: string, usage: string): CliArgumentError {
    return new CliArgumentError(`Unknown option: ${flag}\n${usage}`)
  }

  static missingValue(flag: string, usage: string): CliArgumentError {
    return new CliArgumentError(`Missing value for ${flag}\n${usage}`)
  }

  static repeatedOption(flag: string, usage: string): CliArgumentError {
    return new CliArgumentError(
      `Option ${flag} can only be used once\n${usage}`
    )
  }
}
