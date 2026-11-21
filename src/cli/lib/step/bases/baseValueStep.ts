import type { CliPromptField } from "@/contracts/cli/step"
import { BaseStep } from "@/cli/lib/step/bases/baseStep"
import { formatValidationIssues } from "@/cli/lib/util/validation"

export abstract class BaseValueStep extends BaseStep {
  constructor(protected readonly field: Omit<CliPromptField, "type">) {
    super()
  }

  async run(): Promise<Record<string, unknown>> {
    return { [this.field.key]: await this.prompt() }
  }

  protected getValidator(): CliPromptField["validate"] {
    const schema = this.field.schema
    if (schema === undefined) {
      return this.field.validate
    }

    return (value) => {
      const parsed = schema.safeParse(value)
      if (parsed.success) {
        return true
      }

      return formatValidationIssues(
        parsed.error.issues,
        this.field.errorMessages
      )
    }
  }

  protected abstract prompt(): Promise<string>
}
