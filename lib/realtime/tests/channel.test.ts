import { describe, expect, it } from "vitest"
import { RealtimeChannel } from "@/lib/realtime/channel"
import { realtimeMessageChannelSchema } from "@/schemas/channelMessage"

describe("RealtimeChannel", () => {
  const channel = new RealtimeChannel(
    "realtime:messages",
    realtimeMessageChannelSchema
  )
  const validUuid = "123e4567-e89b-12d3-a456-426614174000"

  it("exposes the configured channel name", () => {
    expect(channel.name).toBe("realtime:messages")
  })

  describe("validate()", () => {
    it("validates and transforms valid input data with whitespace trimming", () => {
      const result = channel.validate({
        id: validUuid,
        text: "  Hello World  ",
        createdAt: "12:00:00 PM",
      })

      expect(result).toEqual({
        id: validUuid,
        text: "Hello World",
        createdAt: "12:00:00 PM",
      })
    })

    it("throws a ZodError when validating invalid data", () => {
      expect(() =>
        channel.validate({
          id: "not-a-uuid",
          text: "   ",
          createdAt: "12:00:00 PM",
        })
      ).toThrow()
    })
  })

  describe("parse()", () => {
    it("parses valid JSON strings into typed payloads", () => {
      const raw = JSON.stringify({
        id: validUuid,
        text: "Valid message",
        createdAt: "12:00:00 PM",
      })

      expect(channel.parse(raw)).toEqual({
        id: validUuid,
        text: "Valid message",
        createdAt: "12:00:00 PM",
      })
    })

    it("returns null when parsing malformed JSON", () => {
      expect(channel.parse("{bad-json")).toBeNull()
    })

    it("returns null when JSON does not match the schema requirements", () => {
      const raw = JSON.stringify({
        id: "123", // invalid UUID
        text: "", // empty text fails min(1)
        createdAt: "12:00:00 PM",
      })
      expect(channel.parse(raw)).toBeNull()
    })
  })
})
