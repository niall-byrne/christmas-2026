import { BaseStep } from "@/lib/cli/step/bases/baseStep"

export interface OutputStepOptions {
  readonly lines: readonly ((
    context: Readonly<Record<string, unknown>>
  ) => string)[]
}

export class OutputStep extends BaseStep {
  constructor(protected readonly options: OutputStepOptions) {
    super()
  }

  async run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    for (const line of this.options.lines) {
      console.log(line(context))
    }
    return {}
  }
}
