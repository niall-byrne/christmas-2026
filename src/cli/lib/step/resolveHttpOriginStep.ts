import { CliUrlError } from "@/cli/lib/error/cliUrlError"
import { BaseStep } from "@/cli/lib/step/bases/baseStep"

export interface ResolveHttpOriginStepOptions {
  readonly outputKey: string
  readonly value: (
    context: Readonly<Record<string, unknown>>
  ) => string | undefined
  readonly environmentVariable: string
  readonly option: string
  readonly rootPath?: string
}

export class ResolveHttpOriginStep extends BaseStep {
  constructor(protected readonly options: ResolveHttpOriginStepOptions) {
    super()
  }

  async run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    return {
      [this.options.outputKey]: this.resolveOrigin(this.options.value(context)),
    }
  }

  private resolveOrigin(value: string | undefined): string {
    if (!value) {
      throw CliUrlError.required(
        this.options.environmentVariable,
        this.options.option
      )
    }

    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw CliUrlError.invalid(value)
    }

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== (this.options.rootPath ?? "/") ||
      url.search ||
      url.hash
    ) {
      throw CliUrlError.originRequired(value)
    }

    return url.origin
  }
}
