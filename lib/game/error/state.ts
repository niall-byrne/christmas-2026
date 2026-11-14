export class InvalidGameStateError extends Error {
  constructor(validationMessage = "INVALID_GAME_DATA") {
    super(`Game state validation failed: ${validationMessage}`)
    this.name = "InvalidGameStateError"
    Object.setPrototypeOf(this, InvalidGameStateError.prototype)
  }
}
