import { password } from "@inquirer/prompts"
import type { CliPromptField } from "@/contracts/cli/step"
import { BaseValueStep } from "@/cli/lib/step/bases/baseValueStep"

export class PasswordStep extends BaseValueStep {
  constructor(field: Omit<CliPromptField, "type">) {
    super(field)
  }

  protected prompt(): Promise<string> {
    return password({
      message: this.field.message,
      validate: this.getValidator(),
      mask: this.field.mask,
    })
  }
}
