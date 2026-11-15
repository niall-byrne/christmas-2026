import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest"
import { FallbackPolling } from "@/lib/game/client/subscription/fallbackPolling"

describe("FallbackPolling", () => {
  let fetchSnapshot: Mock<() => Promise<unknown>>
  let polling: FallbackPolling

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe("when polling starts", () => {
    beforeEach(() => {
      fetchSnapshot = vi.fn(async () => {})
      polling = new FallbackPolling({
        fetchSnapshot,
        isActive: () => true,
      })
      polling.start()
    })

    it("waits for the grace period before fetching", async () => {
      await vi.advanceTimersByTimeAsync(9_999)
      expect(fetchSnapshot).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(fetchSnapshot).toHaveBeenCalledOnce()
    })

    it("polls repeatedly after the grace period", async () => {
      await vi.advanceTimersByTimeAsync(20_000)

      expect(fetchSnapshot).toHaveBeenCalledTimes(3)
    })
  })

  describe("when stream liveness expires", () => {
    beforeEach(() => {
      fetchSnapshot = vi.fn(async () => {})
      polling = new FallbackPolling({
        fetchSnapshot,
        isActive: () => true,
      })
      polling.startImmediately()
    })

    it("fetches a snapshot without waiting for the grace period", () => {
      expect(fetchSnapshot).toHaveBeenCalledOnce()
    })

    it("continues polling at the configured interval", async () => {
      await vi.advanceTimersByTimeAsync(5_000)

      expect(fetchSnapshot).toHaveBeenCalledTimes(2)
    })
  })

  describe("when start is called more than once", () => {
    beforeEach(() => {
      fetchSnapshot = vi.fn(async () => {})
      polling = new FallbackPolling({
        fetchSnapshot,
        isActive: () => true,
      })
      polling.start()
      polling.start()
    })

    it("runs only one polling loop", async () => {
      await vi.advanceTimersByTimeAsync(10_000)

      expect(fetchSnapshot).toHaveBeenCalledOnce()
    })
  })

  describe("when stopped before the grace period ends", () => {
    beforeEach(() => {
      fetchSnapshot = vi.fn(async () => {})
      polling = new FallbackPolling({
        fetchSnapshot,
        isActive: () => true,
      })
      polling.start()
      polling.stop()
    })

    it("does not start polling", async () => {
      await vi.advanceTimersByTimeAsync(20_000)

      expect(fetchSnapshot).not.toHaveBeenCalled()
    })
  })

  describe("when stopped after polling starts", () => {
    beforeEach(async () => {
      fetchSnapshot = vi.fn(async () => {})
      polling = new FallbackPolling({
        fetchSnapshot,
        isActive: () => true,
      })
      polling.start()
      await vi.advanceTimersByTimeAsync(10_000)
      polling.stop()
    })

    it("clears the polling interval", async () => {
      await vi.advanceTimersByTimeAsync(10_000)

      expect(fetchSnapshot).toHaveBeenCalledOnce()
    })
  })

  describe("when the subscription is inactive", () => {
    beforeEach(() => {
      fetchSnapshot = vi.fn(async () => {})
      polling = new FallbackPolling({
        fetchSnapshot,
        isActive: () => false,
      })
      polling.start()
    })

    it("does not fetch when the grace period ends", async () => {
      await vi.advanceTimersByTimeAsync(10_000)

      expect(fetchSnapshot).not.toHaveBeenCalled()
    })
  })
})
