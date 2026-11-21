import type { CreateGameRequest } from "@/contracts/game/api/data"
import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"
import { formatValidationIssues } from "@/cli/lib/util/validation"
import { ERROR_MESSAGES } from "@/schemas/game/api/error"
import { CreateGameBodySchema } from "@/schemas/game/api/game"

export function validateCreateGameData(value: unknown): CreateGameRequest {
  const parsed = CreateGameBodySchema.safeParse(value)
  if (!parsed.success) {
    throw new CliBaseError(
      formatValidationIssues(parsed.error.issues, ERROR_MESSAGES)
    )
  }
  return parsed.data
}
