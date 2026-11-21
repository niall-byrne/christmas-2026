"use client"

import { useEffect, useSyncExternalStore } from "react"
import { gameClientState } from "@/game/ui/state/clientState"
import { subscribeToGameState } from "@/game/ui/client/subscription"

export function useGameState(gameId: string) {
  const state = useSyncExternalStore(
    (listener) => gameClientState.subscribe(gameId, listener),
    () => gameClientState.getSnapshot(gameId),
    () => null
  )

  useEffect(() => subscribeToGameState(gameId), [gameId])

  return state
}
