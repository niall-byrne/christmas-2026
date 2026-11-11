import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { RealtimeChannel } from "@/lib/realtime/channel"

const mockInstances: MockRedis[] = []

class MockRedis {
  public handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  public publish = vi.fn(async () => 1)
  public subscribe = vi.fn(async () => 1)
  public unsubscribe = vi.fn(async () => 1)
  public disconnect = vi.fn()

  constructor(public url: string) {
    mockInstances.push(this)
  }

  on(event: string, cb: (...args: unknown[]) => void) {
    const list = this.handlers.get(event) ?? []
    list.push(cb)
    this.handlers.set(event, list)
    return this
  }

  removeAllListeners(event?: string) {
    if (event) {
      this.handlers.delete(event)
    } else {
      this.handlers.clear()
    }
    return this
  }

  emitMessage(channel: string, payload: string) {
    for (const cb of this.handlers.get("message") ?? []) {
      cb(channel, payload)
    }
  }
}

vi.mock("ioredis", () => ({
  default: MockRedis,
}))

const { RedisRealtimeBroker } = await import("@/lib/realtime/broker")

const messageSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
})

describe("RedisRealtimeBroker", () => {
  const channel = new RealtimeChannel("realtime:test", messageSchema)

  beforeEach(() => {
    mockInstances.length = 0
    const g = globalThis as unknown as {
      redisPublishers?: Map<string, unknown>
    }
    g.redisPublishers?.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("fails hard on publish when REDIS_URL is missing or blank", async () => {
    const broker = new RedisRealtimeBroker("")

    await expect(
      broker.publish(channel, { id: "1", text: "Hello" })
    ).rejects.toThrow("REDIS_URL is not configured")
  })

  it("fails hard on createStreamResponse when REDIS_URL is missing", () => {
    const broker = new RedisRealtimeBroker("")
    const req = new NextRequest("http://localhost:3000/api/realtime")

    expect(() => broker.createStreamResponse(channel, req)).toThrow(
      "REDIS_URL is not configured"
    )
  })

  it("validates and publishes serialized JSON to the Redis channel", async () => {
    const broker = new RedisRealtimeBroker("redis://localhost:6379")

    const output = await broker.publish(channel, { id: "1", text: "Ping" })

    expect(output).toEqual({ id: "1", text: "Ping" })
    expect(mockInstances).toHaveLength(1)
    expect(mockInstances[0].publish).toHaveBeenCalledWith(
      "realtime:test",
      JSON.stringify({ id: "1", text: "Ping" })
    )
  })

  it("does not publish to Redis when payload fails schema validation", async () => {
    const broker = new RedisRealtimeBroker("redis://localhost:6379")

    await expect(
      broker.publish(channel, { id: "1", text: "" })
    ).rejects.toThrow()

    expect(mockInstances).toHaveLength(0)
  })

  it("streams SSE data events and cleans up Redis on request abort", async () => {
    const broker = new RedisRealtimeBroker("redis://localhost:6379")
    const abortController = new AbortController()
    const req = new NextRequest("http://localhost:3000/api/realtime", {
      signal: abortController.signal,
    })

    const response = broker.createStreamResponse(channel, req, 60_000)

    expect(response.headers.get("Content-Type")).toBe("text/event-stream")
    expect(mockInstances).toHaveLength(1)

    const subscriber = mockInstances[0]
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    await Promise.resolve()
    expect(subscriber.subscribe).toHaveBeenCalledWith("realtime:test")

    subscriber.emitMessage(
      "realtime:test",
      JSON.stringify({ id: "2", text: "Live!" })
    )

    const { value } = await reader.read()
    expect(decoder.decode(value)).toBe('data: {"id":"2","text":"Live!"}\n\n')

    abortController.abort()

    await vi.waitFor(() => {
      expect(subscriber.unsubscribe).toHaveBeenCalledWith("realtime:test")
      expect(subscriber.disconnect).toHaveBeenCalled()
    })
  })

  it("does not throw if heartbeat fires after request abort", async () => {
    vi.useFakeTimers()

    const broker = new RedisRealtimeBroker("redis://localhost:6379")
    const abortController = new AbortController()
    const req = new NextRequest("http://localhost:3000/api/realtime", {
      signal: abortController.signal,
    })

    broker.createStreamResponse(channel, req, 1_000)
    await Promise.resolve()

    abortController.abort()

    expect(() => vi.advanceTimersByTime(5_000)).not.toThrow()
  })
})
