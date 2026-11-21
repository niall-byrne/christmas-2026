import { BaseStep } from "@/lib/cli/step/bases/baseStep"
import { createTerminalDivider } from "@/lib/cli/util/terminal"

export class DividerStep extends BaseStep {
  static readonly DEFAULT_CHARACTER = "="
  static readonly MINIMUM_WIDTH = 1
  static readonly DEFAULT_WIDTH = 80

  constructor(
    protected readonly character = DividerStep.DEFAULT_CHARACTER,
    protected readonly minimumWidth = DividerStep.MINIMUM_WIDTH,
    protected readonly defaultWidth = DividerStep.DEFAULT_WIDTH
  ) {
    super()
  }

  async run(): Promise<Record<string, unknown>> {
    console.log(
      createTerminalDivider(
        this.character,
        process.stdout.columns,
        this.defaultWidth,
        this.minimumWidth
      )
    )
    return {}
  }
}
