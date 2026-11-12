import { describe, expect, it } from "vitest"
import { messageChannel } from "@/lib/channels"
import { realtimeMessageChannelSchema } from "@/schemas/channelMessage"

describe("lib/channels", () => {
  const validUuid = "123e4567-e89b-12d3-a456-426614174000"

  describe("messageChannel", () => {
    it("uses the expected Redis Pub/Sub channel name", () => {
      expect(messageChannel.name).toBe("realtime:messages")
    })

    describe("parse()", () => {
      it("parses a valid serialized message payload", () => {
        const payload = {
          id: validUuid,
          text: "Merry Christmas!",
          createdAt: "11:30:00 AM",
        }

        expect(messageChannel.parse(JSON.stringify(payload))).toEqual(payload)
      })

      it("returns null when parsing an invalid payload", () => {
        const invalid = JSON.stringify({
          id: "not-a-uuid",
          text: "",
          createdAt: "11:30:00 AM",
        })

        expect(messageChannel.parse(invalid)).toBeNull()
      })
    })
  })

  describe("realtimeMessageChannelSchema", () => {
    describe("when validating message text", () => {
      it("trims leading and trailing whitespace from text", () => {
        const result = realtimeMessageChannelSchema.parse({
          id: validUuid,
          text: "   Hello Santa   ",
          createdAt: "11:30:00 AM",
        })

        expect(result.text).toBe("Hello Santa")
      })

      it("rejects empty or whitespace-only messages", () => {
        const result = realtimeMessageChannelSchema.safeParse({
          id: validUuid,
          text: "    ",
          createdAt: "11:30:00 AM",
        })

        expect(result.success).toBe(false)
      })

      it("rejects messages longer than 500 characters", () => {
        const result = realtimeMessageChannelSchema.safeParse({
          id: validUuid,
          text: "a".repeat(501),
          createdAt: "11:30:00 AM",
        })

        expect(result.success).toBe(false)
      })

      it("accepts messages at the exact 500-character limit", () => {
        const result = realtimeMessageChannelSchema.safeParse({
          id: validUuid,
          text: "a".repeat(500),
          createdAt: "11:30:00 AM",
        })

        expect(result.success).toBe(true)
      })
    })

    describe("when validating identifier formatting", () => {
      it("rejects non-UUID ids", () => {
        const result = realtimeMessageChannelSchema.safeParse({
          id: "12345",
          text: "Valid text",
          createdAt: "11:30:00 AM",
        })

        expect(result.success).toBe(false)
      })
    })
  })
})
