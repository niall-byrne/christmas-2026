import { BaseStep } from "@/lib/cli/step/bases/baseStep"

export class TextStep extends BaseStep {
  constructor(protected readonly value: string) {
    super()
  }

  async run(): Promise<Record<string, unknown>> {
    console.log(this.value)
    return {}
  }
}
