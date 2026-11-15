"use client"

import { SSE_HEARTBEAT_EVENT, SSE_HEARTBEAT_TIMEOUT_MS } from "@/contracts/sse"
import { gameClientState } from "@/lib/game/clientState"
import { FallbackPolling } from "@/lib/game/client/subscription/fallbackPolling"
import { GameSnapshot } from "@/lib/game/client/subscription/gameSnapshot"
import { GameStateEvents } from "@/lib/game/client/subscription/gameStateEvents"

class GameStateSubscription {
  protected active = true
  protected readonly eventSource: EventSource
  protected readonly fallbackPolling: FallbackPolling
  protected readonly gameSnapshot: GameSnapshot
  protected readonly gameStateEvents: GameStateEvents
  protected streamLivenessTimer: ReturnType<typeof setTimeout> | undefined

  constructor(protected readonly gameId: string) {
    this.eventSource = new EventSource(
      `/api/v1/games/${encodeURIComponent(gameId)}/events`
    )
    this.fallbackPolling = new FallbackPolling({
      fetchSnapshot: () => this.gameSnapshot.fetch(),
      isActive: () => this.active,
    })
    this.gameSnapshot = new GameSnapshot(gameId, {
      isActive: () => this.active,
      applySnapshot: (snapshot) => gameClientState.applySnapshot(snapshot),
      onUnauthorized: () => this.handleTerminalSnapshotResponse(),
      onNotFound: () => {
        gameClientState.clearSnapshot(gameId)
        this.handleTerminalSnapshotResponse()
      },
    })
    this.gameStateEvents = new GameStateEvents(gameId, (snapshot) =>
      gameClientState.applySnapshot(snapshot)
    )
  }

  subscribe(): () => void {
    this.eventSource.onopen = () => this.handleEventSourceOpen()
    this.eventSource.onmessage = (event) => {
      this.resetStreamLivenessTimer()
      this.gameStateEvents.handle(event)
    }
    this.eventSource.onerror = () => this.fallbackPolling.start()
    this.eventSource.addEventListener(SSE_HEARTBEAT_EVENT, this.handleHeartbeat)

    return () => this.cleanup()
  }

  protected handleEventSourceOpen() {
    this.fallbackPolling.stop()
    this.resetStreamLivenessTimer()
    void this.gameSnapshot.fetch()
  }

  protected handleHeartbeat = () => {
    this.resetStreamLivenessTimer()
  }

  protected resetStreamLivenessTimer() {
    this.stopStreamLivenessTimer()
    this.streamLivenessTimer = setTimeout(() => {
      this.streamLivenessTimer = undefined
      this.fallbackPolling.startImmediately()
    }, SSE_HEARTBEAT_TIMEOUT_MS)
  }

  protected stopStreamLivenessTimer() {
    if (this.streamLivenessTimer === undefined) return
    clearTimeout(this.streamLivenessTimer)
    this.streamLivenessTimer = undefined
  }

  protected handleTerminalSnapshotResponse() {
    this.fallbackPolling.stop()
    this.stopStreamLivenessTimer()
    this.eventSource.close()
  }

  protected cleanup() {
    this.active = false
    this.fallbackPolling.stop()
    this.stopStreamLivenessTimer()
    this.eventSource.removeEventListener(
      SSE_HEARTBEAT_EVENT,
      this.handleHeartbeat
    )
    this.eventSource.close()
  }
}

export function subscribeToGameState(gameId: string): () => void {
  return new GameStateSubscription(gameId).subscribe()
}
