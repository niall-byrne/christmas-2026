import open, { apps } from "open"
import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"
import { BaseStep } from "@/lib/cli/step/bases/baseStep"

export class OpenFileStep extends BaseStep {
  constructor(protected readonly pathKey: string) {
    super()
  }

  async run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    const filePath = context[this.pathKey]
    if (typeof filePath !== "string") {
      throw new CliBaseError(
        `Cannot open missing workflow file: ${this.pathKey}`
      )
    }

    await open(filePath, { app: { name: apps.browser } })
    return {}
  }
}
