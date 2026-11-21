import { readFile } from "node:fs/promises"
import { CliFileError } from "@/lib/cli/error/cliFileError"
import { BaseStep } from "@/lib/cli/step/bases/baseStep"

export interface ReadJsonFileStepOptions {
  readonly outputKey: string
  readonly path: (
    context: Readonly<Record<string, unknown>>
  ) => string | undefined
  readonly encoding?: BufferEncoding
}

export class ReadJsonFileStep extends BaseStep {
  constructor(protected readonly options: ReadJsonFileStepOptions) {
    super()
  }

  async run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    const file = this.options.path(context)
    if (file === undefined) {
      return {}
    }

    return { [this.options.outputKey]: await this.readJsonFile(file) }
  }

  protected async readJsonFile(file: string): Promise<unknown> {
    let contents: string
    try {
      contents = await readFile(file, this.options.encoding ?? "utf8")
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw CliFileError.unreadable(file, reason)
    }

    try {
      return JSON.parse(contents)
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw CliFileError.invalidJson(file, error.message)
      }
      throw error
    }
  }
}
