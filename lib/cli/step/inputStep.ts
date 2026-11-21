import { input } from "@inquirer/prompts"
import type { CliPromptField } from "@/contracts/cli/step"
import { BaseValueStep } from "@/lib/cli/step/bases/baseValueStep"

export class InputStep extends BaseValueStep {
  constructor(field: Omit<CliPromptField, "type" | "mask">) {
    super(field)
  }

  protected prompt(): Promise<string> {
    return input({
      message: this.field.message,
      validate: this.getValidator(),
    })
  }
}
