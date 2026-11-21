import {
  type GameClientEndpointLogger,
  gameClientLogger,
} from "@/game/ui/client/logger"

enum SnapshotFetchResultKind {
  Snapshot = "snapshot",
  Response = "response",
  Unavailable = "unavailable",
}

type SnapshotFetchResult =
  | { kind: SnapshotFetchResultKind.Snapshot; snapshot: unknown }
  | { kind: SnapshotFetchResultKind.Response; status: number }
  | { kind: SnapshotFetchResultKind.Unavailable }

type GameSnapshotOptions = {
  isActive: () => boolean
  applySnapshot: (snapshot: unknown) => void
  onUnauthorized: () => void
  onNotFound: () => void
  fetcher?: typeof fetch
}

export class GameSnapshot {
  protected snapshotRequest: Promise<void> | undefined
  protected readonly fetcher: typeof fetch

  constructor(
    protected readonly gameId: string,
    protected readonly options: GameSnapshotOptions,
    protected readonly logger: GameClientEndpointLogger = gameClientLogger
  ) {
    this.fetcher = options.fetcher ?? fetch
  }

  protected async fetchSnapshot(): Promise<SnapshotFetchResult> {
    try {
      const response = await this.fetcher(
        `/api/v1/games/${encodeURIComponent(this.gameId)}`,
        { cache: "no-store" }
      )
      if (!response.ok) {
        return {
          kind: SnapshotFetchResultKind.Response,
          status: response.status,
        }
      }

      return {
        kind: SnapshotFetchResultKind.Snapshot,
        snapshot: await response.json(),
      }
    } catch (error) {
      this.logger.warn("Snapshot request failed", {
        component: "GameSnapshot",
        gameId: this.gameId,
        error: error instanceof Error ? error.message : String(error),
      })
      return { kind: SnapshotFetchResultKind.Unavailable }
    }
  }

  protected apply(result: SnapshotFetchResult) {
    if (!this.options.isActive()) return

    if (result.kind === SnapshotFetchResultKind.Response) {
      this.logger.warn("Snapshot request returned an error", {
        component: "GameSnapshot",
        gameId: this.gameId,
        status: result.status,
      })
      if (result.status === 401) {
        this.options.onUnauthorized()
      } else if (result.status === 404) {
        this.options.onNotFound()
      }
      return
    }

    if (
      result.kind === SnapshotFetchResultKind.Snapshot &&
      typeof result.snapshot === "object" &&
      result.snapshot !== null &&
      "gameId" in result.snapshot &&
      result.snapshot.gameId === this.gameId
    ) {
      this.options.applySnapshot(result.snapshot)
      this.logger.info("Applied game snapshot", {
        component: "GameSnapshot",
        gameId: this.gameId,
        revision:
          "revision" in result.snapshot ? result.snapshot.revision : undefined,
      })
      return
    }

    if (result.kind === SnapshotFetchResultKind.Snapshot) {
      this.logger.warn("Ignoring invalid snapshot response", {
        component: "GameSnapshot",
        gameId: this.gameId,
      })
    }
  }

  fetch(): Promise<void> {
    if (this.snapshotRequest) return this.snapshotRequest

    this.snapshotRequest = this.fetchSnapshot()
      .then((result) => this.apply(result))
      .finally(() => {
        this.snapshotRequest = undefined
      })

    return this.snapshotRequest
  }
}
