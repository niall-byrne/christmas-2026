import "server-only"
import { addPlayerScript } from "@/game/api/redis/scripts/addPlayer"
import { createTeamScript } from "@/game/api/redis/scripts/createTeam"
import { createGameScript } from "@/game/api/redis/scripts/createGame"
import { removePlayerScript } from "@/game/api/redis/scripts/removePlayer"
import { readGameSnapshotScript } from "@/game/api/redis/scripts/readGameSnapshot"
import { setReadyStatusScript } from "@/game/api/redis/scripts/setReadyStatus"
import { updateGameScript } from "@/game/api/redis/scripts/updateGame"
import { updateTeamScoreScript } from "@/game/api/redis/scripts/updateTeamScore"

export class GameScripts {
  static readonly createGame = createGameScript
  static readonly createTeam = createTeamScript
  static readonly addPlayer = addPlayerScript
  static readonly removePlayer = removePlayerScript
  static readonly setReadyStatus = setReadyStatusScript
  static readonly updateGame = updateGameScript
  static readonly updateTeamScore = updateTeamScoreScript
  static readonly readGameSnapshot = readGameSnapshotScript
}
