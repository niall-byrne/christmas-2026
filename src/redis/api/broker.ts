import "server-only"
import type { z } from "zod"
import {
  SSE_HEARTBEAT_EVENT,
  SSE_HEARTBEAT_INTERVAL_MS,
} from "@/contracts/realtime/sse"
import { RedisClient } from "@/redis/api/client"
import type { RedisChannel } from "@/redis/shared/channel"

export class RedisBroker {
  async publish<TSchema extends z.ZodType>(
    channel: RedisChannel<TSchema>,
    data: z.input<TSchema>
  ): Promise<z.output<TSchema>> {
    const validated = channel.validate(data)
    await RedisClient.getClient().publish(
      channel.name,
      JSON.stringify(validated)
    )
    return validated
  }

  async createStreamResponse<TSchema extends z.ZodType>(
    channel: RedisChannel<TSchema>,
    req: Request,
    heartbeatMs = SSE_HEARTBEAT_INTERVAL_MS
  ): Promise<Response> {
    const encoder = new TextEncoder()
    const subscriber = RedisClient.getClient().duplicate()
    subscriber.on("error", () => {})

    let heartbeat: ReturnType<typeof setInterval> | undefined
    let closed = false
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    const pendingMessages: string[] = []

    const cleanup = async () => {
      if (closed) return
      closed = true

      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = undefined
      }

      subscriber.removeAllListeners("message")
      req.signal.removeEventListener("abort", abortStream)
      await subscriber.unsubscribe(channel.name).catch(() => {})
      subscriber.disconnect()
    }

    const enqueue = (chunk: string) => {
      if (closed) return
      if (!controller) {
        pendingMessages.push(chunk)
        return
      }
      try {
        controller.enqueue(encoder.encode(chunk))
      } catch {
        void cleanup()
      }
    }

    const abortStream = () => {
      void cleanup()
      try {
        controller?.close()
      } catch {
        // Controller already closed
      }
    }

    subscriber.on("message", (_channel, message) => {
      enqueue(`data: ${message}\n\n`)
    })
    req.signal.addEventListener("abort", abortStream, { once: true })
    if (req.signal.aborted) {
      await cleanup()
      return this.createClosedStreamResponse()
    }

    try {
      await subscriber.subscribe(channel.name)
    } catch (error) {
      await cleanup()
      throw error
    }

    if (closed) {
      return this.createClosedStreamResponse()
    }

    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController
        for (const message of pendingMessages.splice(0)) {
          enqueue(message)
        }
        heartbeat = setInterval(() => {
          enqueue(`event: ${SSE_HEARTBEAT_EVENT}\ndata: {}\n\n`)
        }, heartbeatMs)
      },
      async cancel() {
        await cleanup()
      },
    })

    return new Response(stream, {
      headers: this.streamHeaders(),
    })
  }

  protected createClosedStreamResponse(): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close()
        },
      }),
      { headers: this.streamHeaders() }
    )
  }

  protected streamHeaders(): HeadersInit {
    return {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    }
  }
}

export const redisBroker = new RedisBroker()
