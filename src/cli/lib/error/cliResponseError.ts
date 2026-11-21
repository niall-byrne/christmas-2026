import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"

export class CliResponseError extends CliBaseError {
  static invalidJson(status: number): CliResponseError {
    return new CliResponseError(
      `The server returned invalid JSON (HTTP ${status})`
    )
  }

  static malformed(operation: string, status: number): CliResponseError {
    return new CliResponseError(
      `${operation} failed with HTTP ${status}: malformed error response`
    )
  }

  static requestFailed(
    operation: string,
    status: number,
    error: string,
    message: string
  ): CliResponseError {
    return new CliResponseError(
      `${operation} failed with HTTP ${status}: ${error}: ${message}`
    )
  }
}
