import { z } from "zod"

export class RedisChannel<TSchema extends z.ZodType = z.ZodType> {
  constructor(
    public readonly name: string,
    public readonly schema: TSchema
  ) {}

  validate(data: z.input<TSchema>): z.output<TSchema> {
    return this.schema.parse(data)
  }

  parse(raw: string): z.output<TSchema> | null {
    try {
      const result = this.schema.safeParse(JSON.parse(raw))
      return result.success ? result.data : null
    } catch {
      return null
    }
  }
}
