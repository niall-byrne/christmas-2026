import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
  vi,
} from "vitest"
import { renderHook } from "@testing-library/react"
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel"
import { RedisChannel } from "@/lib/redis/channel"
import {
  realtimeMessageChannelSchema,
  RealtimeChannelMessage,
} from "@/schemas/redis/channelMessage"

const ENDPOINT = "/api/realtime"
const channel = new RedisChannel(
  "realtime:messages",
  realtimeMessageChannelSchema
)

class MockEventSource {
  public static instances: MockEventSource[] = []
  public url: string
  public readyState: number = 0
  public withCredentials: boolean = false
  public onopen: ((this: EventSource, ev: Event) => void) | null = null
  public onmessage: ((this: EventSource, ev: MessageEvent) => void) | null =
    null
  public onerror: ((this: EventSource, ev: Event) => void) | null = null
  public closed = false

  constructor(url: string | URL) {
    this.url = String(url)
    MockEventSource.instances.push(this)
  }

  public close = vi.fn(() => {
    this.closed = true
  })

  public addEventListener = vi.fn()
  public removeEventListener = vi.fn()
  public dispatchEvent = vi.fn(() => true)

  public emitMessage(data: unknown) {
    if (this.onmessage) {
      const event = {
        data: typeof data === "string" ? data : JSON.stringify(data),
      } as MessageEvent
      this.onmessage.call(this as unknown as EventSource, event)
    }
  }
}

vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource)

function renderChannelHook(onMessage: (msg: RealtimeChannelMessage) => void) {
  return renderHook(() => useRealtimeChannel(ENDPOINT, channel, onMessage))
}

describe("useRealtimeChannel hook", () => {
  let mockOnMessage: Mock<(msg: RealtimeChannelMessage) => void>

  beforeEach(() => {
    MockEventSource.instances = []
    mockOnMessage = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("when initialized with a valid endpoint and channel", () => {
    beforeEach(() => {
      renderChannelHook(mockOnMessage)
    })

    it("establishes an EventSource connection to the specified endpoint", () => {
      expect(MockEventSource.instances).toHaveLength(1)
      expect(MockEventSource.instances[0].url).toBe(ENDPOINT)
    })

    it("parses incoming messages and invokes the callback on valid payloads", () => {
      const validMessage = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        text: "Hello from Redis SSE",
        createdAt: "12:00:00 PM",
      }

      MockEventSource.instances[0].emitMessage(JSON.stringify(validMessage))

      expect(mockOnMessage).toHaveBeenCalledTimes(1)
      expect(mockOnMessage).toHaveBeenCalledWith(validMessage)
    })

    it("ignores and drops incoming messages that fail schema validation", () => {
      const invalidMessage = {
        id: "not-a-uuid",
        text: "",
        createdAt: "12:00:00 PM",
      }

      MockEventSource.instances[0].emitMessage(JSON.stringify(invalidMessage))

      expect(mockOnMessage).not.toHaveBeenCalled()
    })
  })

  describe("when unmounted", () => {
    it("closes the EventSource connection cleanly", () => {
      const { unmount } = renderChannelHook(mockOnMessage)

      expect(MockEventSource.instances[0].closed).toBe(false)

      unmount()

      expect(MockEventSource.instances[0].close).toHaveBeenCalledTimes(1)
      expect(MockEventSource.instances[0].closed).toBe(true)
    })
  })
})
