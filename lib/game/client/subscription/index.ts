"use client"

import { SSE_HEARTBEAT_EVENT, SSE_HEARTBEAT_TIMEOUT_MS } from "@/contracts/sse"
import { gameClientState } from "@/lib/game/clientState"
import { gameClientLogger } from "@/lib/game/client/logger"
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
    this.gameStateEvents = new GameStateEvents(
      gameId,
      (snapshot) => gameClientState.applySnapshot(snapshot),
      gameClientLogger
    )
  }

  subscribe(): () => void {
    this.eventSource.onopen = () => this.handleEventSourceOpen()
    this.eventSource.onmessage = (event) => {
      this.resetStreamLivenessTimer()
      this.gameStateEvents.handle(event)
    }
    this.eventSource.onerror = () => {
      gameClientLogger.warn("SSE connection errored", {
        component: "GameStateSubscription",
        gameId: this.gameId,
        readyState: this.eventSource.readyState,
      })
      this.fallbackPolling.start()
    }
    this.eventSource.addEventListener(SSE_HEARTBEAT_EVENT, this.handleHeartbeat)

    return () => this.cleanup()
  }

  protected handleEventSourceOpen() {
    this.fallbackPolling.stop()
    this.resetStreamLivenessTimer()
    gameClientLogger.info("SSE connection opened", {
      component: "GameStateSubscription",
      gameId: this.gameId,
    })
    void this.gameSnapshot.fetch()
  }

  protected handleHeartbeat = () => {
    this.resetStreamLivenessTimer()
    gameClientLogger.info("Received SSE heartbeat", {
      component: "GameStateSubscription",
      gameId: this.gameId,
    })
  }

  protected resetStreamLivenessTimer() {
    this.stopStreamLivenessTimer()
    this.streamLivenessTimer = setTimeout(() => {
      this.streamLivenessTimer = undefined
      gameClientLogger.warn(
        "SSE heartbeat timed out; starting snapshot polling",
        {
          component: "GameStateSubscription",
          gameId: this.gameId,
          timeoutMs: SSE_HEARTBEAT_TIMEOUT_MS,
        }
      )
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
