import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"
import { BaseStep } from "@/cli/lib/step/bases/baseStep"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export interface CreateJoinUrlStepOptions {
  readonly originKey: string
  readonly gameIdKey: string
  readonly gameDataKey: string
  readonly outputKey: string
  readonly path: string
  readonly passwordField: string
  readonly passwordQueryParameter: string
}

export class CreateJoinUrlStep extends BaseStep {
  constructor(protected readonly options: CreateJoinUrlStepOptions) {
    super()
  }

  async run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    const origin = context[this.options.originKey]
    const gameId = context[this.options.gameIdKey]
    const gameData = context[this.options.gameDataKey]
    const password = isRecord(gameData)
      ? gameData[this.options.passwordField]
      : undefined

    if (typeof origin !== "string") {
      throw new CliBaseError(
        `Cannot build a join URL without workflow value: ${this.options.originKey}`
      )
    }
    if (typeof gameId !== "string") {
      throw new CliBaseError(
        `Cannot build a join URL without workflow value: ${this.options.gameIdKey}`
      )
    }
    if (typeof password !== "string") {
      throw new CliBaseError(
        `Cannot build a join URL without a password in workflow value: ${this.options.gameDataKey}`
      )
    }

    const url = new URL(
      `${this.options.path.replace(/\/$/, "")}/${encodeURIComponent(gameId)}`,
      origin
    )
    url.searchParams.set(this.options.passwordQueryParameter, password)
    return { [this.options.outputKey]: url }
  }
}
