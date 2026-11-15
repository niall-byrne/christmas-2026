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
import { RedisClient } from "@/lib/redis/client"
import { RedisChannel } from "@/lib/redis/channel"

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

const { RedisBroker } = await import("@/lib/redis/broker")

const realtimeMessageChannelSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  createdAt: z.string(),
})

describe("RedisBroker", () => {
  const TEST_FIXTURES = {
    channelName: "realtime:test",
    streamUrl: "http://localhost:3000/api/realtime",
    validUuid: "123e4567-e89b-12d3-a456-426614174000",
    createdAt: "12:00:00 PM",
  } as const

  const channel = new RedisChannel(
    TEST_FIXTURES.channelName,
    realtimeMessageChannelSchema
  )

  let broker: InstanceType<typeof RedisBroker>
  let mockClient: MockRedis
  let getClientSpy: MockInstance

  beforeEach(() => {
    broker = new RedisBroker()
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

    it("propagates the error on createStreamResponse", async () => {
      const req = new NextRequest(TEST_FIXTURES.streamUrl)

      await expect(broker.createStreamResponse(channel, req)).rejects.toThrow(
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
    describe("when a client subscribes", () => {
      let abortController: AbortController
      let response: Response
      let subscriber: MockRedis

      beforeEach(async () => {
        abortController = new AbortController()
        const req = new NextRequest(TEST_FIXTURES.streamUrl, {
          signal: abortController.signal,
        })

        response = await broker.createStreamResponse(channel, req, 60_000)
        subscriber = mockClient.duplicates[0]
        await Promise.resolve()
      })

      afterEach(() => {
        abortController?.abort()
      })

      it("returns an SSE response", () => {
        expect(response.headers.get("Content-Type")).toBe("text/event-stream")
      })

      it("subscribes a duplicate Redis client to the channel", () => {
        expect(mockClient.duplicate).toHaveBeenCalledOnce()
        expect(subscriber.subscribe).toHaveBeenCalledWith(
          TEST_FIXTURES.channelName
        )
      })

      it("ignores subscriber connection errors", () => {
        expect(subscriber.listenerCount("error")).toBeGreaterThanOrEqual(1)
        expect(() =>
          subscriber.emit("error", new Error("connect ECONNRESET"))
        ).not.toThrow()
      })

      it("streams an SSE data event", async () => {
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
      })
    })

    describe("when the request is aborted", () => {
      let abortController: AbortController
      let subscriber: MockRedis

      beforeEach(async () => {
        abortController = new AbortController()
        const req = new NextRequest(TEST_FIXTURES.streamUrl, {
          signal: abortController.signal,
        })
        await broker.createStreamResponse(channel, req, 60_000)
        subscriber = mockClient.duplicates[0]
        abortController.abort()
        await vi.waitFor(() => subscriber.disconnect.mock.calls.length === 1)
      })

      it("releases the subscriber after abort", () => {
        expect(subscriber.unsubscribe).toHaveBeenCalledWith(
          TEST_FIXTURES.channelName
        )
        expect(subscriber.disconnect).toHaveBeenCalledOnce()
      })
    })

    describe("when a message arrives as Redis confirms the subscription", () => {
      it("buffers the message until the SSE response is ready", async () => {
        const payload = JSON.stringify({
          id: TEST_FIXTURES.validUuid,
          text: "Arrived during subscription",
          createdAt: TEST_FIXTURES.createdAt,
        })
        mockClient.duplicate.mockImplementationOnce(() => {
          const subscriber = new MockRedis()
          subscriber.subscribe.mockImplementation(async () => {
            subscriber.emitMessage(TEST_FIXTURES.channelName, payload)
            return 1
          })
          mockClient.duplicates.push(subscriber)
          return subscriber
        })

        const response = await broker.createStreamResponse(
          channel,
          new NextRequest(TEST_FIXTURES.streamUrl),
          60_000
        )
        const reader = response.body!.getReader()
        const { value } = await reader.read()

        expect(new TextDecoder().decode(value)).toBe(`data: ${payload}\n\n`)
        await reader.cancel()
      })
    })

    describe("when a client cancels the response body", () => {
      let subscriber: MockRedis

      beforeEach(async () => {
        const req = new NextRequest(TEST_FIXTURES.streamUrl)
        const response = await broker.createStreamResponse(channel, req, 60_000)
        subscriber = mockClient.duplicates[0]
        await Promise.resolve()
        await response.body?.cancel()
      })

      it("releases the duplicated subscriber after cancellation", () => {
        expect(subscriber.unsubscribe).toHaveBeenCalledWith(
          TEST_FIXTURES.channelName
        )
        expect(subscriber.disconnect).toHaveBeenCalledTimes(1)
      })
    })

    describe("when heartbeat fires after request abort", () => {
      let abortController: AbortController

      beforeEach(async () => {
        vi.useFakeTimers()
        abortController = new AbortController()
        const req = new NextRequest(TEST_FIXTURES.streamUrl, {
          signal: abortController.signal,
        })

        await broker.createStreamResponse(channel, req, 1_000)
        abortController.abort()
      })

      it("does not throw when controller is already closed", () => {
        expect(() => vi.advanceTimersByTime(5_000)).not.toThrow()
      })
    })
  })
})
