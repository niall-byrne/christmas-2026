export const FALLBACK_START_DELAY_MS = 10_000
export const FALLBACK_POLL_INTERVAL_MS = 5_000

export type FallbackPollingOptions = {
  fetchSnapshot: () => Promise<unknown>
  isActive: () => boolean
  startDelayMs?: number
  pollIntervalMs?: number
}

export class FallbackPolling {
  protected startTimer: ReturnType<typeof setTimeout> | undefined
  protected pollingInterval: ReturnType<typeof setInterval> | undefined

  constructor(protected readonly options: FallbackPollingOptions) {}

  start() {
    this.scheduleStart(this.options.startDelayMs ?? FALLBACK_START_DELAY_MS)
  }

  startImmediately() {
    this.scheduleStart(0)
  }

  protected scheduleStart(delayMs: number) {
    if (this.startTimer !== undefined || this.pollingInterval !== undefined) {
      return
    }

    const beginPolling = () => {
      this.startTimer = undefined
      if (!this.options.isActive()) return

      void this.options.fetchSnapshot()
      this.pollingInterval = setInterval(() => {
        void this.options.fetchSnapshot()
      }, this.options.pollIntervalMs ?? FALLBACK_POLL_INTERVAL_MS)
    }

    if (delayMs <= 0) {
      beginPolling()
      return
    }

    this.startTimer = setTimeout(beginPolling, delayMs)
  }

  stop() {
    if (this.startTimer !== undefined) {
      clearTimeout(this.startTimer)
      this.startTimer = undefined
    }
    if (this.pollingInterval !== undefined) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = undefined
    }
  }
}
