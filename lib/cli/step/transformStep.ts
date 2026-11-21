import { BaseStep } from "@/lib/cli/step/bases/baseStep"

export interface TransformStepOptions {
  readonly outputKey: string
  readonly transform: (
    context: Readonly<Record<string, unknown>>
  ) => unknown | Promise<unknown>
}

export class TransformStep extends BaseStep {
  constructor(protected readonly options: TransformStepOptions) {
    super()
  }

  async run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    return {
      [this.options.outputKey]: await this.options.transform(context),
    }
  }
}
