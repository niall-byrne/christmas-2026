import { describe, expect, it } from "vitest"
import { realtimeMessageChannelSchema } from "@/schemas/redis/channelMessage"

describe("realtimeMessageChannelSchema", () => {
  const TEST_FIXTURES = {
    validUuid: "123e4567-e89b-12d3-a456-426614174000",
    createdAt: "11:30:00 AM",
  } as const

  describe("when validating valid message payloads", () => {
    it("trims leading and trailing whitespace from text", () => {
      const result = realtimeMessageChannelSchema.parse({
        id: TEST_FIXTURES.validUuid,
        text: "   Hello Santa   ",
        createdAt: TEST_FIXTURES.createdAt,
      })

      expect(result).toEqual({
        id: TEST_FIXTURES.validUuid,
        text: "Hello Santa",
        createdAt: TEST_FIXTURES.createdAt,
      })
    })

    it("accepts messages at the exact 500-character limit", () => {
      const exactLimitText = "a".repeat(500)
      const result = realtimeMessageChannelSchema.safeParse({
        id: TEST_FIXTURES.validUuid,
        text: exactLimitText,
        createdAt: TEST_FIXTURES.createdAt,
      })

      expect(result.success).toBe(true)
    })
  })

  describe("when validating invalid message payloads", () => {
    interface InvalidMessageCase {
      label: string
      payload: Record<string, unknown>
    }

    const INVALID_MESSAGE_CASES: InvalidMessageCase[] = [
      {
        label: "empty string text",
        payload: {
          id: TEST_FIXTURES.validUuid,
          text: "",
          createdAt: TEST_FIXTURES.createdAt,
        },
      },
      {
        label: "whitespace-only text",
        payload: {
          id: TEST_FIXTURES.validUuid,
          text: "    ",
          createdAt: TEST_FIXTURES.createdAt,
        },
      },
      {
        label: "text exceeding 500 characters",
        payload: {
          id: TEST_FIXTURES.validUuid,
          text: "a".repeat(501),
          createdAt: TEST_FIXTURES.createdAt,
        },
      },
      {
        label: "non-UUID id",
        payload: {
          id: "12345",
          text: "Valid text",
          createdAt: TEST_FIXTURES.createdAt,
        },
      },
      {
        label: "missing createdAt timestamp",
        payload: {
          id: TEST_FIXTURES.validUuid,
          text: "Valid text",
        },
      },
    ]

    it.each(INVALID_MESSAGE_CASES)("rejects $label", ({ payload }) => {
      const result = realtimeMessageChannelSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })
  })
})
