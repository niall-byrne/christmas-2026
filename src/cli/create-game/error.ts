import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"

export class CreateGameResponseError extends CliBaseError {
  static missingGameId(): CreateGameResponseError {
    return new CreateGameResponseError(
      "The API response did not contain a game ID"
    )
  }

  static invalidGameId(): CreateGameResponseError {
    return new CreateGameResponseError(
      "The API response contained an invalid game ID"
    )
  }
}
