"use client"

import type { GetGameResponse } from "@/contracts/game/api/data/game"
import { GetGameResponseSchema } from "@/schemas/game/api/game"

type Listener = () => void

class GameClientState {
  private readonly gameStates = new Map<string, GetGameResponse>()
  private readonly listeners = new Map<string, Set<Listener>>()

  getSnapshot(gameId: string): GetGameResponse | null {
    return this.gameStates.get(gameId) ?? null
  }

  applySnapshot(snapshot: unknown): boolean {
    const parsed = GetGameResponseSchema.safeParse(snapshot)
    if (!parsed.success) {
      return false
    }

    const current = this.gameStates.get(parsed.data.gameId)
    if (current && parsed.data.revision <= current.revision) {
      return false
    }

    this.gameStates.set(parsed.data.gameId, parsed.data)
    this.notify(parsed.data.gameId)
    return true
  }

  clearSnapshot(gameId: string): void {
    if (!this.gameStates.delete(gameId)) {
      return
    }

    this.notify(gameId)
  }

  subscribe(gameId: string, listener: Listener): () => void {
    const gameListeners = this.listeners.get(gameId) ?? new Set<Listener>()
    gameListeners.add(listener)
    this.listeners.set(gameId, gameListeners)

    return () => {
      gameListeners.delete(listener)
      if (gameListeners.size === 0) {
        this.listeners.delete(gameId)
      }
    }
  }

  private notify(gameId: string): void {
    for (const listener of this.listeners.get(gameId) ?? []) {
      listener()
    }
  }
}

export const gameClientState = new GameClientState()
