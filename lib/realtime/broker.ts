import "server-only"
import Redis from "ioredis"
import { NextRequest } from "next/server"
import type { RealtimeChannel } from "@/lib/realtime/channel"
import type { RealtimeChannelMessage } from "@/schemas/channelMessage"

const globalForRedis = globalThis as unknown as {
  redisPublishers: Map<string, Redis> | undefined
}

export class RedisRealtimeBroker {
  private readonly redisUrl: string | undefined

  constructor(redisUrl = process.env.REDIS_URL) {
    this.redisUrl = redisUrl
  }

  private resolveUrl(): string {
    if (!this.redisUrl || !this.redisUrl.trim()) {
      throw new Error(
        "REDIS_URL is not configured. Set REDIS_URL in your environment variables."
      )
    }
    return this.redisUrl
  }

  private getPublisher(): Redis {
    const url = this.resolveUrl()

    if (!globalForRedis.redisPublishers) {
      globalForRedis.redisPublishers = new Map()
    }

    let pub = globalForRedis.redisPublishers.get(url)
    if (!pub) {
      pub = new Redis(url)
      globalForRedis.redisPublishers.set(url, pub)
    }

    return pub
  }

  async publish(
    channel: RealtimeChannel,
    data: RealtimeChannelMessage
  ): Promise<RealtimeChannelMessage> {
    const validated = channel.validate(data)
    await this.getPublisher().publish(channel.name, JSON.stringify(validated))
    return validated
  }

  createStreamResponse(
    channel: RealtimeChannel,
    req: NextRequest,
    heartbeatMs = 25_000
  ): Response {
    const url = this.resolveUrl()
    const encoder = new TextEncoder()
    const subscriber = new Redis(url)
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let closed = false

    const cleanup = async () => {
      if (closed) return
      closed = true

      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = undefined
      }

      subscriber.removeAllListeners("message")
      await subscriber.unsubscribe(channel.name).catch(() => {})
      subscriber.disconnect()
    }

    const enqueue = (
      controller: ReadableStreamDefaultController<Uint8Array>,
      chunk: string
    ) => {
      if (closed) return
      try {
        controller.enqueue(encoder.encode(chunk))
      } catch {
        void cleanup()
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        await subscriber.subscribe(channel.name)

        if (closed) return

        heartbeat = setInterval(() => {
          enqueue(controller, ": ping\n\n")
        }, heartbeatMs)

        subscriber.on("message", (_ch, message) => {
          enqueue(controller, `data: ${message}\n\n`)
        })

        req.signal.addEventListener("abort", () => {
          void cleanup()
          try {
            controller.close()
          } catch {
            // Controller already closed
          }
        })
      },
      async cancel() {
        await cleanup()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    })
  }
}

export const redisBroker = new RedisRealtimeBroker()
