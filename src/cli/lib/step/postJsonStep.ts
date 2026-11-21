import { CliResponseError } from "@/cli/lib/error/cliResponseError"
import { BaseStep } from "@/cli/lib/step/bases/baseStep"

export interface PostJsonStepOptions {
  readonly url: (context: Readonly<Record<string, unknown>>) => URL
  readonly bodyKey: string
  readonly outputKey: string
  readonly operation: string
  readonly method: string
  readonly contentTypeHeader: string
  readonly contentType: string
  readonly successStatus: number
  readonly parseSuccess: (payload: unknown) => unknown
}

export class PostJsonStep extends BaseStep {
  constructor(protected readonly options: PostJsonStepOptions) {
    super()
  }

  async run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    const response = await fetch(this.options.url(context), {
      method: this.options.method,
      headers: {
        [this.options.contentTypeHeader]: this.options.contentType,
      },
      body: JSON.stringify(context[this.options.bodyKey]),
    })
    const payload = await this.readJsonResponse(response)

    if (response.status !== this.options.successStatus) {
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("error" in payload) ||
        typeof payload.error !== "string" ||
        !("message" in payload) ||
        typeof payload.message !== "string"
      ) {
        throw CliResponseError.malformed(
          this.options.operation,
          response.status
        )
      }

      throw CliResponseError.requestFailed(
        this.options.operation,
        response.status,
        payload.error,
        payload.message
      )
    }

    return {
      [this.options.outputKey]: this.options.parseSuccess(payload),
    }
  }

  protected async readJsonResponse(response: Response): Promise<unknown> {
    const contents = await response.text()
    try {
      return JSON.parse(contents)
    } catch {
      throw CliResponseError.invalidJson(response.status)
    }
  }
}
