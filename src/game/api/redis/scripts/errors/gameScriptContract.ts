import {
  GAME_SCRIPT_CONTRACT_ERROR,
  type GameScriptContractErrorCode,
} from "@/contracts/game/api/data/gameScript"

const GAME_SCRIPT_CONTRACT_ERROR_MESSAGES = {
  [GAME_SCRIPT_CONTRACT_ERROR.ADD_PLAYER_ID]:
    "Add-player script returned an invalid player ID",
  [GAME_SCRIPT_CONTRACT_ERROR.ADD_PLAYER_NAME]:
    "Add-player script returned an invalid player name",
  [GAME_SCRIPT_CONTRACT_ERROR.ADD_PLAYER_READY_STATUS]:
    "Add-player script returned an invalid initial ready status",
  [GAME_SCRIPT_CONTRACT_ERROR.CREATE_GAME_RESULT]:
    "Create-game script returned an invalid success result",
  [GAME_SCRIPT_CONTRACT_ERROR.CREATE_TEAM_ID]:
    "Create-team script returned an invalid team ID",
  [GAME_SCRIPT_CONTRACT_ERROR.PLAYER_STATE]:
    "Player mutation script returned an invalid player state",
  [GAME_SCRIPT_CONTRACT_ERROR.TEAM_SCORE]:
    "Update-score script returned an unexpected score",
} satisfies Record<GameScriptContractErrorCode, string>

export class GameScriptContractError extends Error {
  constructor(readonly code: GameScriptContractErrorCode) {
    super(GAME_SCRIPT_CONTRACT_ERROR_MESSAGES[code])
    this.name = "GameScriptContractError"
    Object.setPrototypeOf(this, GameScriptContractError.prototype)
  }
}
