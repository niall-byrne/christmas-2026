import { confirm } from "@inquirer/prompts"
import type { CliStep } from "@/contracts/cli/step"
import { BaseStep } from "@/cli/lib/step/bases/baseStep"

export interface RepeatStepOptions {
  readonly key: string
  readonly steps: readonly CliStep[]
  readonly heading: (number: number) => string
  readonly minimumCount: number
  readonly addAnother: {
    readonly message: string
    readonly default: boolean
  }
  readonly blankLine?: string
}

export class RepeatStep extends BaseStep {
  constructor(protected readonly options: RepeatStepOptions) {
    super()
  }

  async run(): Promise<Record<string, unknown>> {
    const items: Record<string, unknown>[] = []
    let shouldContinue = items.length < this.options.minimumCount

    while (shouldContinue) {
      if (this.options.blankLine !== undefined) {
        console.log(this.options.blankLine)
      }
      console.log(this.options.heading(items.length + 1))

      const answers = await this.runSteps(this.options.steps)
      items.push(answers)

      shouldContinue =
        items.length < this.options.minimumCount ||
        (await confirm({
          message: this.options.addAnother.message,
          default: this.options.addAnother.default,
        }))
    }

    return { [this.options.key]: items }
  }

  protected async runSteps(
    steps: readonly CliStep[]
  ): Promise<Record<string, unknown>> {
    const context: Record<string, unknown> = {}

    for (const step of steps) {
      Object.assign(context, await step.run(context))
    }

    return context
  }
}
