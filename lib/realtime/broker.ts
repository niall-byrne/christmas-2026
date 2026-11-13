import "server-only"
import { NextRequest } from "next/server"
import type { z } from "zod"
import { RedisClient } from "@/lib/redis"
import type { RealtimeChannel } from "@/lib/realtime/channel"

export class RedisRealtimeBroker {
  async publish<TSchema extends z.ZodType>(
    channel: RealtimeChannel<TSchema>,
    data: z.input<TSchema>
  ): Promise<z.output<TSchema>> {
    const validated = channel.validate(data)
    await RedisClient.getClient().publish(
      channel.name,
      JSON.stringify(validated)
    )
    return validated
  }

  createStreamResponse<TSchema extends z.ZodType>(
    channel: RealtimeChannel<TSchema>,
    req: NextRequest,
    heartbeatMs = 25_000
  ): Response {
    const encoder = new TextEncoder()
    const subscriber = RedisClient.getClient().duplicate()
    subscriber.on("error", () => {})

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
