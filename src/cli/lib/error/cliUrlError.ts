import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"

export class CliUrlError extends CliBaseError {
  static required(environmentVariable: string, option: string): CliUrlError {
    return new CliUrlError(
      `${environmentVariable} environment variable or ${option} flag is required`
    )
  }

  static invalid(value: string): CliUrlError {
    return new CliUrlError(`Invalid target URL: ${value}`)
  }

  static originRequired(value: string): CliUrlError {
    return new CliUrlError(`Target URL must be an HTTP(S) origin: ${value}`)
  }
}
