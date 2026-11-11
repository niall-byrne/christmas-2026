"use client";

import { useEffect } from "react";
import type { z } from "zod";
import type { RealtimeChannel } from "@/lib/realtime/channel";

export function useRealtimeChannel<TSchema extends z.ZodTypeAny>(
  endpoint: string,
  channel: RealtimeChannel<TSchema>,
  onMessage: (data: z.output<TSchema>) => void,
) {
  useEffect(() => {
    const source = new EventSource(endpoint);

    source.onmessage = (event) => {
      const parsed = channel.parse(event.data);
      if (parsed) onMessage(parsed);
    };

    return () => source.close();
  }, [endpoint, channel, onMessage]);
}
