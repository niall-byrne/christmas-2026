import "server-only"
import { addPlayerScript } from "@/lib/game/redisScripts/addPlayer"
import { createTeamScript } from "@/lib/game/redisScripts/createTeam"
import { removePlayerScript } from "@/lib/game/redisScripts/removePlayer"
import { readGameSnapshotScript } from "@/lib/game/redisScripts/readGameSnapshot"
import { setReadyStatusScript } from "@/lib/game/redisScripts/setReadyStatus"
import { updateGameScript } from "@/lib/game/redisScripts/updateGame"
import { updateTeamScoreScript } from "@/lib/game/redisScripts/updateTeamScore"

export class GameScripts {
  static readonly createTeam = createTeamScript
  static readonly addPlayer = addPlayerScript
  static readonly removePlayer = removePlayerScript
  static readonly setReadyStatus = setReadyStatusScript
  static readonly updateGame = updateGameScript
  static readonly updateTeamScore = updateTeamScoreScript
  static readonly readGameSnapshot = readGameSnapshotScript
}
