import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import QRCode from "qrcode"
import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"
import { BaseStep } from "@/lib/cli/step/bases/baseStep"

export interface QrCodeStepOptions {
  readonly urlKey: string
  readonly outputKey: string
  readonly fileName: (context: Readonly<Record<string, unknown>>) => string
  readonly requestedPath?: (
    context: Readonly<Record<string, unknown>>
  ) => string | undefined
  readonly temporaryDirectoryPrefix: string
  readonly width: number
  readonly margin: number
  readonly extension?: string
}

export class QrCodeStep extends BaseStep {
  constructor(protected readonly options: QrCodeStepOptions) {
    super()
  }

  async run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    const url = context[this.options.urlKey]
    if (!(url instanceof URL)) {
      throw new CliBaseError(
        `Cannot generate a QR code from workflow value: ${this.options.urlKey}`
      )
    }

    const requestedPath = this.options.requestedPath?.(context)
    const outputPath =
      requestedPath ??
      path.join(
        await mkdtemp(
          path.join(tmpdir(), this.options.temporaryDirectoryPrefix)
        ),
        `${this.options.fileName(context)}${this.options.extension ?? ".png"}`
      )

    await QRCode.toFile(outputPath, url.toString(), {
      width: this.options.width,
      margin: this.options.margin,
    })

    return { [this.options.outputKey]: outputPath }
  }
}
