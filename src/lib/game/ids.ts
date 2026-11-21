import { randomBytes } from "node:crypto"

function createId(): string {
  return randomBytes(12).toString("hex")
}

export const gameIds = {
  createGameId: () => createId(),
  createEntityId: () => createId(),
} as const
