"use client"

import { useEffect, useSyncExternalStore } from "react"
import { gameClientState } from "@/lib/game/clientState"
import { gameEventSchema } from "@/schemas/redis/gameStateEvent"

type SnapshotFetchResult =
  | { kind: "snapshot"; snapshot: unknown }
  | { kind: "response"; status: number }
  | { kind: "unavailable" }

async function fetchGameSnapshot(gameId: string): Promise<SnapshotFetchResult> {
  try {
    const response = await fetch(
      `/api/v1/games/${encodeURIComponent(gameId)}`,
      { cache: "no-store" }
    )
    if (!response.ok) {
      return { kind: "response", status: response.status }
    }
    return { kind: "snapshot", snapshot: await response.json() }
  } catch {
    return { kind: "unavailable" }
  }
}

export function useGameState(gameId: string) {
  const state = useSyncExternalStore(
    (listener) => gameClientState.subscribe(gameId, listener),
    () => gameClientState.getSnapshot(gameId),
    () => null
  )

  useEffect(() => {
    let active = true
    let availabilityCheck: Promise<void> | undefined
    const source = new EventSource(
      `/api/v1/games/${encodeURIComponent(gameId)}/events`
    )

    const fetchSnapshot = async (checkAuthorization = false) => {
      const result = await fetchGameSnapshot(gameId)
      if (!active) return

      if (result.kind === "response") {
        if (checkAuthorization && result.status === 401) {
          source.close()
          return
        }
        if (result.status === 404) {
          gameClientState.clearSnapshot(gameId)
          source.close()
        }
        return
      }
      if (
        result.kind === "snapshot" &&
        typeof result.snapshot === "object" &&
        result.snapshot !== null &&
        "gameId" in result.snapshot &&
        result.snapshot.gameId === gameId
      ) {
        gameClientState.applySnapshot(result.snapshot)
      }
    }

    source.onopen = () => {
      void fetchSnapshot()
    }

    source.onmessage = (event) => {
      let payload: unknown
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }

      if (
        typeof payload === "object" &&
        payload !== null &&
        "type" in payload &&
        typeof payload.type === "string" &&
        payload.type !== "game.state.changed"
      ) {
        return
      }

      const parsed = gameEventSchema.safeParse(payload)
      if (
        parsed.success &&
        parsed.data.type === "game.state.changed" &&
        parsed.data.data.gameId === gameId
      ) {
        gameClientState.applySnapshot(parsed.data.data)
      }
    }

    source.onerror = () => {
      if (availabilityCheck) return
      availabilityCheck = fetchSnapshot(true).finally(() => {
        availabilityCheck = undefined
      })
    }

    return () => {
      active = false
      source.close()
    }
  }, [gameId])

  return state
}
