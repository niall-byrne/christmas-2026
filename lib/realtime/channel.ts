import {
  RealtimeChannelMessage,
  RealtimeChannelMessageSchema,
} from "@/schemas/channelMessage"

export class RealtimeChannel {
  constructor(
    public readonly name: string,
    public readonly schema: RealtimeChannelMessageSchema
  ) {}

  validate(data: RealtimeChannelMessage): RealtimeChannelMessage {
    return this.schema.parse(data)
  }

  parse(raw: string): RealtimeChannelMessage | null {
    try {
      const result = this.schema.safeParse(JSON.parse(raw))
      return result.success ? result.data : null
    } catch {
      return null
    }
  }
}
