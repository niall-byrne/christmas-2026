"use client"

import { useCallback, useState, type FormEvent } from "react"
import { sendMessage } from "@/app/actions"
import { useRealtimeChannel } from "@/realtime/ui/useRealtimeChannel"
import { realtimeChannel } from "@/realtime/channel"
import { RealtimeChannelMessage } from "@/schemas/realtime/channelMessage"
import { Button } from "@/ui/components/primitives/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/ui/components/primitives/card"
import { Input } from "@/ui/components/primitives/input"
import { AccessibilityToggle } from "@/ui/components/primitives/accessibility"

export function LiveFeed() {
  const [messages, setMessages] = useState<RealtimeChannelMessage[]>([])
  const [text, setText] = useState("")

  const handleIncoming = useCallback((msg: RealtimeChannelMessage) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  useRealtimeChannel("/api/realtime", realtimeChannel, handleIncoming)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!text.trim()) return
    const current = text
    setText("")
    await sendMessage(current)
  }

  return (
    <Card className="mx-auto mt-10 w-full max-w-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Live Feed</CardTitle>
        <AccessibilityToggle />
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="max-h-60 space-y-2 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Waiting for live messages...
            </p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="rounded-md border p-2 text-sm">
                <p>{msg.text}</p>
                <span className="text-xs text-muted-foreground">
                  {msg.createdAt}
                </span>
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Broadcast a message..."
          />
          <Button type="submit">Send</Button>
        </form>
      </CardContent>
    </Card>
  )
}
