import type { CliStep } from "@/contracts/cli/step"

export abstract class BaseStep implements CliStep {
  abstract run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>
}
