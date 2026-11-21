import { describe, expect, it } from "vitest"
import { realtimeChannel } from "@/realtime/channel"
import { RedisChannel } from "@/redis/shared/channel"
import { realtimeMessageChannelSchema } from "@/schemas/realtime/channelMessage"

describe("realtimeChannel", () => {
  it("configures the existing realtime channel", () => {
    expect(realtimeChannel).toBeInstanceOf(RedisChannel)
    expect(realtimeChannel.name).toBe("realtime:messages")
    expect(realtimeChannel.schema).toBe(realtimeMessageChannelSchema)
  })
})
