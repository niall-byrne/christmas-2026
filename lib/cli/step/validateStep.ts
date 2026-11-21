import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"
import { BaseStep } from "@/lib/cli/step/bases/baseStep"

export interface ValidateStepOptions {
  readonly key: string
  readonly validate: (value: unknown) => unknown
}

export class ValidateStep extends BaseStep {
  constructor(protected readonly options: ValidateStepOptions) {
    super()
  }

  async run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    if (!Object.hasOwn(context, this.options.key)) {
      throw new CliBaseError(
        `Cannot validate missing workflow value: ${this.options.key}`
      )
    }

    return {
      [this.options.key]: this.options.validate(context[this.options.key]),
    }
  }
}
