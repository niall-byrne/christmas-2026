import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"

export class CliFileError extends CliBaseError {
  static unreadable(file: string, reason: string): CliFileError {
    return new CliFileError(`Unable to read ${file}: ${reason}`)
  }

  static invalidJson(file: string, reason: string): CliFileError {
    return new CliFileError(`Invalid JSON in ${file}: ${reason}`)
  }
}
