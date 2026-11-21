import type { CreateGameRequest } from "@/contracts/gameData"
import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"
import { formatValidationIssues } from "@/lib/cli/util/validation"
import { ERROR_MESSAGES } from "@/schemas/gameData/error"
import { CreateGameBodySchema } from "@/schemas/gameData/game"

export function validateCreateGameData(value: unknown): CreateGameRequest {
  const parsed = CreateGameBodySchema.safeParse(value)
  if (!parsed.success) {
    throw new CliBaseError(
      formatValidationIssues(parsed.error.issues, ERROR_MESSAGES)
    )
  }
  return parsed.data
}
