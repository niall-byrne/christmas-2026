"use client"

import { useEffect } from "react"
import type { RealtimeChannel } from "@/lib/realtime/channel"
import type { RealtimeChannelMessage } from "@/schemas/channelMessage"

export function useRealtimeChannel(
  endpoint: string,
  channel: RealtimeChannel,
  onMessage: (data: RealtimeChannelMessage) => void
) {
  useEffect(() => {
    const source = new EventSource(endpoint)

    source.onmessage = (event) => {
      const parsed = channel.parse(event.data)
      if (parsed) onMessage(parsed)
    }

    return () => source.close()
  }, [endpoint, channel, onMessage])
}
