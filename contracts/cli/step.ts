export interface CliPromptField {
  readonly key: string
  readonly type: "input" | "password"
  readonly message: string
  readonly mask?: string
  readonly validate?: (value: string) => boolean | string
  readonly schema?: CliPromptSchema
  readonly errorMessages?: Readonly<Record<string, string>>
}

export interface CliPromptSchema {
  safeParse: (value: string) =>
    | { success: true }
    | {
        success: false
        error: { issues: Array<{ path: PropertyKey[]; message: string }> }
      }
}

export interface CliStep {
  run(
    context: Readonly<Record<string, unknown>>
  ): Promise<Record<string, unknown>>
}

export interface CliPromptConfig {
  readonly introduction?: string
  readonly steps: readonly CliStep[]
}
