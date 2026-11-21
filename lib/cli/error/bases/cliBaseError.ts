import type { CliExitCode } from "@/contracts/cli/command"

export class CliBaseError extends Error {
  readonly exitCode: CliExitCode = 1

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }

  static from(error: unknown): CliBaseError {
    if (error instanceof CliBaseError) {
      return error
    }

    if (error instanceof Error) {
      return new CliBaseError(error.message, { cause: error })
    }

    return new CliBaseError(String(error))
  }
}
