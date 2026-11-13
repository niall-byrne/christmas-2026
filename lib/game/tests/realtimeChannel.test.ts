import { describe, expect, it } from "vitest"
import { realtimeChannel } from "@/lib/game/realtimeChannel"
import { RedisChannel } from "@/lib/redis/channel"
import { realtimeMessageChannelSchema } from "@/schemas/redis/channelMessage"

describe("realtimeChannel", () => {
  it("configures a RedisChannel instance with the expected channel name and schema", () => {
    expect(realtimeChannel).toBeInstanceOf(RedisChannel)
    expect(realtimeChannel.name).toBe("realtime:messages")
    expect(realtimeChannel.schema).toBe(realtimeMessageChannelSchema)
  })
})
