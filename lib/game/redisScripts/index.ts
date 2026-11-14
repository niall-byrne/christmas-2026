import "server-only"
import { addPlayerScript } from "@/lib/game/redisScripts/addPlayer"
import { createTeamScript } from "@/lib/game/redisScripts/createTeam"
import { incrementRevisionScript } from "@/lib/game/redisScripts/incrementRevision"
import { removePlayerScript } from "@/lib/game/redisScripts/removePlayer"
import { setReadyStatusScript } from "@/lib/game/redisScripts/setReadyStatus"

export class GameScripts {
  static readonly incrementRevision = incrementRevisionScript
  static readonly createTeam = createTeamScript
  static readonly addPlayer = addPlayerScript
  static readonly removePlayer = removePlayerScript
  static readonly setReadyStatus = setReadyStatusScript
}
