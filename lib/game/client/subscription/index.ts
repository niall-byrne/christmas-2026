"use client"

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
    this.eventSource.onmessage = (event) => this.gameStateEvents.handle(event)
    this.eventSource.onerror = () => this.fallbackPolling.start()

    return () => this.cleanup()
  }

  protected handleEventSourceOpen() {
    this.fallbackPolling.stop()
    void this.gameSnapshot.fetch()
  }

  protected handleTerminalSnapshotResponse() {
    this.fallbackPolling.stop()
    this.eventSource.close()
  }

  protected cleanup() {
    this.active = false
    this.fallbackPolling.stop()
    this.eventSource.close()
  }
}

export function subscribeToGameState(gameId: string): () => void {
  return new GameStateSubscription(gameId).subscribe()
}
