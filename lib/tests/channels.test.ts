import { describe, expect, it } from "vitest"
import { messageChannel, messageSchema } from "@/lib/channels"

describe("lib/channels", () => {
  describe("messageChannel", () => {
    it("uses the expected Redis Pub/Sub channel name", () => {
      expect(messageChannel.name).toBe("realtime:messages")
    })

    it("parses a valid serialized message payload", () => {
      const payload = {
        id: crypto.randomUUID(),
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

  describe("messageSchema", () => {
    it("trims leading and trailing whitespace from text", () => {
      const result = messageSchema.parse({
        id: crypto.randomUUID(),
        text: "   Hello Santa   ",
        createdAt: "11:30:00 AM",
      })

      expect(result.text).toBe("Hello Santa")
    })

    it("rejects empty or whitespace-only messages", () => {
      const result = messageSchema.safeParse({
        id: crypto.randomUUID(),
        text: "    ",
        createdAt: "11:30:00 AM",
      })

      expect(result.success).toBe(false)
    })

    it("rejects messages longer than 500 characters", () => {
      const result = messageSchema.safeParse({
        id: crypto.randomUUID(),
        text: "a".repeat(501),
        createdAt: "11:30:00 AM",
      })

      expect(result.success).toBe(false)
    })

    it("accepts messages at the exact 500-character limit", () => {
      const result = messageSchema.safeParse({
        id: crypto.randomUUID(),
        text: "a".repeat(500),
        createdAt: "11:30:00 AM",
      })

      expect(result.success).toBe(true)
    })

    it("rejects non-UUID ids", () => {
      const result = messageSchema.safeParse({
        id: "12345",
        text: "Valid text",
        createdAt: "11:30:00 AM",
      })

      expect(result.success).toBe(false)
    })
  })
})
