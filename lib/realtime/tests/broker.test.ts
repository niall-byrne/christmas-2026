// @vitest-environment node

import { EventEmitter } from "node:events"
import type Redis from "ioredis"
import { NextRequest } from "next/server"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest"
import { z } from "zod"
import { RedisClient } from "@/lib/redis"
import { RealtimeChannel } from "@/lib/realtime/channel"

class MockRedis extends EventEmitter {
  public readonly duplicates: MockRedis[] = []
  public readonly publish = vi.fn(async () => 1)
  public readonly subscribe = vi.fn(async () => 1)
  public readonly unsubscribe = vi.fn(async () => 1)
  public readonly disconnect = vi.fn()

  public readonly duplicate = vi.fn(() => {
    const sub = new MockRedis()
    this.duplicates.push(sub)
    return sub
  })

  emitMessage(channel: string, payload: string) {
    this.emit("message", channel, payload)
  }
}

const { RedisRealtimeBroker } = await import("@/lib/realtime/broker")

const realtimeMessageChannelSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  createdAt: z.string(),
})

describe("RedisRealtimeBroker", () => {
  const TEST_FIXTURES = {
    channelName: "realtime:test",
    streamUrl: "http://localhost:3000/api/realtime",
    validUuid: "123e4567-e89b-12d3-a456-426614174000",
    createdAt: "12:00:00 PM",
  } as const

  const channel = new RealtimeChannel(
    TEST_FIXTURES.channelName,
    realtimeMessageChannelSchema
  )

  let broker: InstanceType<typeof RedisRealtimeBroker>
  let mockClient: MockRedis
  let getClientSpy: MockInstance

  beforeEach(() => {
    broker = new RedisRealtimeBroker()
    mockClient = new MockRedis()
    getClientSpy = vi
      .spyOn(RedisClient, "getClient")
      .mockReturnValue(mockClient as unknown as Redis)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe("when RedisClient.getClient throws a configuration error", () => {
    let configError: Error

    beforeEach(() => {
      configError = new Error(
        "REDIS_URL is not configured. Set REDIS_URL in your environment variables."
      )
      getClientSpy.mockImplementation(() => {
        throw configError
      })
    })

    it("propagates the error on publish", async () => {
      await expect(
        broker.publish(channel, {
          id: TEST_FIXTURES.validUuid,
          text: "Hello",
          createdAt: TEST_FIXTURES.createdAt,
        })
      ).rejects.toThrow(configError)
    })

    it("propagates the error on createStreamResponse", () => {
      const req = new NextRequest(TEST_FIXTURES.streamUrl)

      expect(() => broker.createStreamResponse(channel, req)).toThrow(
        configError
      )
    })
  })

  describe("publish", () => {
    describe("when given a valid payload", () => {
      const inputPayload = {
        id: TEST_FIXTURES.validUuid,
        text: "Ping",
        createdAt: TEST_FIXTURES.createdAt,
      }

      let output: z.output<typeof realtimeMessageChannelSchema>

      beforeEach(async () => {
        output = await broker.publish(channel, inputPayload)
      })

      it("validates and publishes serialized JSON via RedisClient.getClient()", () => {
        expect(output).toEqual(inputPayload)
        expect(getClientSpy).toHaveBeenCalledTimes(1)
        expect(mockClient.publish).toHaveBeenCalledWith(
          TEST_FIXTURES.channelName,
          JSON.stringify(inputPayload)
        )
      })
    })

    describe("when given a payload that fails schema validation", () => {
      it("throws a ZodError without calling RedisClient.getClient()", async () => {
        await expect(
          broker.publish(channel, {
            id: "1",
            text: "Hello",
            createdAt: TEST_FIXTURES.createdAt,
          })
        ).rejects.toThrow()

        expect(getClientSpy).not.toHaveBeenCalled()
        expect(mockClient.publish).not.toHaveBeenCalled()
      })
    })
  })

  describe("createStreamResponse", () => {
    describe("when a client subscribes and receives messages", () => {
      let abortController: AbortController
      let response: Response
      let subscriber: MockRedis

      beforeEach(async () => {
        abortController = new AbortController()
        const req = new NextRequest(TEST_FIXTURES.streamUrl, {
          signal: abortController.signal,
        })

        response = broker.createStreamResponse(channel, req, 60_000)
        expect(mockClient.duplicate).toHaveBeenCalledTimes(1)
        subscriber = mockClient.duplicates[0]
        await Promise.resolve()
      })

      it("duplicates the shared client, attaches an error listener, and subscribes to the channel", () => {
        expect(response.headers.get("Content-Type")).toBe("text/event-stream")
        expect(subscriber.listenerCount("error")).toBeGreaterThanOrEqual(1)
        expect(subscriber.subscribe).toHaveBeenCalledWith(
          TEST_FIXTURES.channelName
        )
        expect(() =>
          subscriber.emit("error", new Error("connect ECONNRESET"))
        ).not.toThrow()
      })

      it("streams SSE data events and cleans up the subscriber on request abort", async () => {
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        const livePayload = JSON.stringify({
          id: TEST_FIXTURES.validUuid,
          text: "Live!",
          createdAt: TEST_FIXTURES.createdAt,
        })

        subscriber.emitMessage(TEST_FIXTURES.channelName, livePayload)

        const { value } = await reader.read()
        expect(decoder.decode(value)).toBe(`data: ${livePayload}\n\n`)

        abortController.abort()

        await vi.waitFor(() => {
          expect(subscriber.unsubscribe).toHaveBeenCalledWith(
            TEST_FIXTURES.channelName
          )
          expect(subscriber.disconnect).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe("when heartbeat fires after request abort", () => {
      it("does not throw when controller is already closed", async () => {
        vi.useFakeTimers()

        const abortController = new AbortController()
        const req = new NextRequest(TEST_FIXTURES.streamUrl, {
          signal: abortController.signal,
        })

        broker.createStreamResponse(channel, req, 1_000)
        await Promise.resolve()

        abortController.abort()

        expect(() => vi.advanceTimersByTime(5_000)).not.toThrow()
      })
    })
  })
})
